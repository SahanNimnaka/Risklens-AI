"""Deterministic risk-scoring engine.

The engine turns the four Phase 1 tables into a flat, explainable list of rule
hits for one explicit ``as_of`` date. It never reads the system clock, calls a
model, or writes to the database. Every point is traceable to a rule in
:mod:`app.modules.risk_monitoring.rules`.

Interpretation notes
--------------------
* Findings are only considered if ``identified_date <= as_of``.
* ``Finding.status`` and ``Control.status`` are current-state columns, not
  history. The engine therefore treats them as the state at ``as_of``. This is
  exact for the synthetic reference date and an approximation for an earlier
  date; it is documented as a limitation rather than hidden.
* An action counts as completed by ``as_of`` when its ``completion_date`` is on
  or before ``as_of``. A currently completed action is never scored.
* Rule 3 deliberately excludes critical findings because Rule 2 already scores
  them; Rule 5 deliberately overlaps Rule 1 for blocked-and-overdue work.

The dataset is small (hundreds of rows), so the engine loads the four tables
and evaluates the rules in Python. That keeps the rules readable and testable;
it is not a premature optimisation target.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActionPlan, Audit, Control, Finding
from app.models.enums import (
    ActionStatus,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.risk_monitoring.rules import (
    CRITICAL_AGE_BONUS_DAYS,
    CRITICAL_AGE_BONUS_POINTS,
    CRITICAL_AGE_ESCALATION_DAYS,
    CRITICAL_AGE_ESCALATION_POINTS,
    CRITICAL_BASE_POINTS,
    RECURRENCE_MAX_POINTS,
    RECURRENCE_MIN_FINDINGS,
    RECURRENCE_POINTS_PER_EXTRA,
    RECURRENCE_WINDOW_DAYS,
    RULE_DEFINITIONS,
    SEVERITY_POINTS,
    STALE_POINTS,
    STALE_SLA_DAYS,
    WEAK_CONTROL_POINTS,
    AlertSeverity,
    RuleDefinition,
    band_for_score,
    overdue_multiplier,
    round_half_up,
)

UNRESOLVED_FINDING_STATUSES: Final[frozenset[FindingStatus]] = frozenset(
    {FindingStatus.OPEN, FindingStatus.IN_PROGRESS}
)

RULE_INDEX: Final[dict[str, int]] = {
    definition.id: index for index, definition in enumerate(RULE_DEFINITIONS)
}


@dataclass(frozen=True)
class RuleHit:
    """One deterministic application of one rule to one entity."""

    rule_id: str
    rule_name: str
    severity: AlertSeverity
    points: int
    entity_type: str
    entity_ref: str
    department: Department
    finding_ref: str | None
    control_ref: str | None
    audit_ref: str | None
    reason: str
    evidence: dict[str, Any]


@dataclass(frozen=True)
class RuleBreakdown:
    """Aggregate count and points for one rule."""

    rule_id: str
    rule_name: str
    severity: AlertSeverity
    entity_type: str
    hits: int
    points: int


@dataclass(frozen=True)
class OpenFindingCounts:
    """Unresolved findings at ``as_of``, reported as context, never scored."""

    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0

    @property
    def total(self) -> int:
        return self.low + self.medium + self.high + self.critical


@dataclass(frozen=True)
class DepartmentRisk:
    """Risk result for one department at ``as_of``."""

    department: Department
    score: int
    band: str
    hits: tuple[RuleHit, ...]
    breakdown: tuple[RuleBreakdown, ...]
    open_findings: OpenFindingCounts


@dataclass(frozen=True)
class PortfolioRisk:
    """Whole-portfolio result at ``as_of``, including department roll-ups."""

    as_of: date
    score: int
    band: str
    hits: tuple[RuleHit, ...]
    breakdown: tuple[RuleBreakdown, ...]
    departments: tuple[DepartmentRisk, ...]


def _definition(rule_id: str) -> RuleDefinition:
    for definition in RULE_DEFINITIONS:
        if definition.id == rule_id:
            return definition
    raise KeyError(f"Unknown rule id: {rule_id}")  # pragma: no cover


def _make_hit(
    rule_id: str,
    *,
    points: int,
    entity_ref: str,
    department: Department,
    finding_ref: str | None,
    control_ref: str | None,
    audit_ref: str | None,
    reason: str,
    evidence: dict[str, Any],
) -> RuleHit:
    definition = _definition(rule_id)
    return RuleHit(
        rule_id=definition.id,
        rule_name=definition.name,
        severity=definition.severity,
        points=points,
        entity_type=definition.entity_type,
        entity_ref=entity_ref,
        department=Department(department),
        finding_ref=finding_ref,
        control_ref=control_ref,
        audit_ref=audit_ref,
        reason=reason,
        evidence=evidence,
    )


def _completed_by(action: ActionPlan, as_of: date) -> bool:
    """True when the action was already completed on the as-of date."""
    if action.status is ActionStatus.COMPLETED:
        return True
    return action.completion_date is not None and action.completion_date <= as_of


def _breakdown_for(hits: tuple[RuleHit, ...]) -> tuple[RuleBreakdown, ...]:
    """Return all six rule buckets in catalog order, including zero rows."""
    return tuple(
        RuleBreakdown(
            rule_id=definition.id,
            rule_name=definition.name,
            severity=definition.severity,
            entity_type=definition.entity_type,
            hits=sum(1 for hit in hits if hit.rule_id == definition.id),
            points=sum(hit.points for hit in hits if hit.rule_id == definition.id),
        )
        for definition in RULE_DEFINITIONS
    )


def compute_risk(session: Session, as_of: date) -> PortfolioRisk:
    """Compute every rule hit and department roll-up at ``as_of``.

    The function is pure with respect to application state: it only reads the
    database and returns a new :class:`PortfolioRisk`. Calling it twice with the
    same database contents and the same ``as_of`` returns equal results.
    """
    audits = {audit.id: audit for audit in session.scalars(select(Audit))}
    controls = session.scalars(select(Control)).all()
    findings = session.scalars(
        select(Finding).where(Finding.identified_date <= as_of)
    ).all()
    actions = session.scalars(select(ActionPlan)).all()

    findings_by_id = {finding.id: finding for finding in findings}
    finding_departments: dict[int, Department] = {}
    finding_audits: dict[int, Audit] = {}
    for finding in findings:
        audit = audits[finding.audit_id]
        finding_departments[finding.id] = Department(audit.department)
        finding_audits[finding.id] = audit

    hits: list[RuleHit] = []

    # Rule 1 - overdue action plans.
    for action in actions:
        finding = findings_by_id.get(action.finding_id)
        if finding is None or _completed_by(action, as_of):
            continue
        if action.due_date >= as_of:
            continue

        days_overdue = (as_of - action.due_date).days
        severity_points = SEVERITY_POINTS[finding.severity]
        multiplier = overdue_multiplier(days_overdue)
        points = round_half_up(severity_points * multiplier)
        department = finding_departments[finding.id]
        audit = finding_audits[finding.id]

        hits.append(
            _make_hit(
                "R1_overdue_action",
                points=points,
                entity_ref=f"action_plan:{action.id}",
                department=department,
                finding_ref=finding.finding_ref,
                control_ref=None,
                audit_ref=audit.audit_ref,
                reason=(
                    f"Action plan for {finding.finding_ref} was due "
                    f"{action.due_date.isoformat()} and is {days_overdue} day(s) "
                    f"overdue at {as_of.isoformat()}."
                ),
                evidence={
                    "action_id": action.id,
                    "due_date": action.due_date.isoformat(),
                    "days_overdue": days_overdue,
                    "completion_date": (
                        action.completion_date.isoformat()
                        if action.completion_date
                        else None
                    ),
                    "finding_severity": finding.severity.value,
                    "severity_points": severity_points,
                    "aging_multiplier": multiplier,
                },
            )
        )

    # Rule 2 - unresolved critical findings.
    # Rule 3 - stale non-critical findings.
    for finding in findings:
        if finding.status not in UNRESOLVED_FINDING_STATUSES:
            continue

        age_days = (as_of - finding.identified_date).days
        department = finding_departments[finding.id]
        audit = finding_audits[finding.id]

        if finding.severity is FindingSeverity.CRITICAL:
            points = CRITICAL_BASE_POINTS
            if age_days > CRITICAL_AGE_BONUS_DAYS:
                points += CRITICAL_AGE_BONUS_POINTS
            if age_days > CRITICAL_AGE_ESCALATION_DAYS:
                points += CRITICAL_AGE_ESCALATION_POINTS

            hits.append(
                _make_hit(
                    "R2_unresolved_critical",
                    points=points,
                    entity_ref=f"finding:{finding.finding_ref}",
                    department=department,
                    finding_ref=finding.finding_ref,
                    control_ref=None,
                    audit_ref=audit.audit_ref,
                    reason=(
                        f"Critical finding {finding.finding_ref} has been "
                        f"{finding.status.value} for {age_days} day(s) at "
                        f"{as_of.isoformat()}."
                    ),
                    evidence={
                        "identified_date": finding.identified_date.isoformat(),
                        "age_days": age_days,
                        "status": finding.status.value,
                    },
                )
            )
            continue

        sla_days = STALE_SLA_DAYS[finding.severity]
        if age_days <= sla_days:
            continue

        hits.append(
            _make_hit(
                "R3_stale_finding",
                points=STALE_POINTS[finding.severity],
                entity_ref=f"finding:{finding.finding_ref}",
                department=department,
                finding_ref=finding.finding_ref,
                control_ref=None,
                audit_ref=audit.audit_ref,
                reason=(
                    f"{finding.severity.value.capitalize()} finding "
                    f"{finding.finding_ref} has exceeded its {sla_days}-day "
                    f"remediation SLA by {age_days - sla_days} day(s)."
                ),
                evidence={
                    "identified_date": finding.identified_date.isoformat(),
                    "age_days": age_days,
                    "sla_days": sla_days,
                    "days_beyond_sla": age_days - sla_days,
                    "status": finding.status.value,
                },
            )
        )

    # Rule 4 - repeated findings in one department/root-cause cluster.
    window_start = as_of - timedelta(days=RECURRENCE_WINDOW_DAYS - 1)
    clusters: dict[
        tuple[Department, RootCauseCategory], list[Finding]
    ] = {}
    for finding in findings:
        if finding.identified_date < window_start:
            continue
        key = (finding_departments[finding.id], finding.root_cause_category)
        clusters.setdefault(key, []).append(finding)

    for (department, root_cause), cluster in clusters.items():
        if len(cluster) < RECURRENCE_MIN_FINDINGS:
            continue
        points = min(
            RECURRENCE_MAX_POINTS,
            (len(cluster) - 2) * RECURRENCE_POINTS_PER_EXTRA,
        )
        finding_refs = sorted(finding.finding_ref for finding in cluster)

        hits.append(
            _make_hit(
                "R4_repeated_findings",
                points=points,
                entity_ref=f"department:{department.value}",
                department=department,
                finding_ref=None,
                control_ref=None,
                audit_ref=None,
                reason=(
                    f"{len(cluster)} findings in {department.value} share root "
                    f"cause {root_cause.value} within the "
                    f"{RECURRENCE_WINDOW_DAYS}-day window ending "
                    f"{as_of.isoformat()}."
                ),
                evidence={
                    "window_start": window_start.isoformat(),
                    "window_end": as_of.isoformat(),
                    "root_cause_category": root_cause.value,
                    "count": len(cluster),
                    "finding_refs": finding_refs,
                },
            )
        )

    # Rule 5 - blocked action plans.
    for action in actions:
        if action.status is not ActionStatus.BLOCKED:
            continue
        finding = findings_by_id.get(action.finding_id)
        if finding is None or _completed_by(action, as_of):
            continue

        department = finding_departments[finding.id]
        audit = finding_audits[finding.id]
        points = SEVERITY_POINTS[finding.severity]
        days_overdue = max(0, (as_of - action.due_date).days)

        hits.append(
            _make_hit(
                "R5_blocked_action",
                points=points,
                entity_ref=f"action_plan:{action.id}",
                department=department,
                finding_ref=finding.finding_ref,
                control_ref=None,
                audit_ref=audit.audit_ref,
                reason=(
                    f"Action plan for {finding.finding_ref} is blocked "
                    f"(due {action.due_date.isoformat()})."
                ),
                evidence={
                    "action_id": action.id,
                    "due_date": action.due_date.isoformat(),
                    "days_overdue": days_overdue,
                    "finding_severity": finding.severity.value,
                },
            )
        )

    # Rule 6 - weak active controls.
    for control in controls:
        if control.status is not ControlStatus.ACTIVE:
            continue
        points = WEAK_CONTROL_POINTS.get(control.effectiveness)
        if points is None:
            continue

        department = Department(control.department)
        hits.append(
            _make_hit(
                "R6_weak_control",
                points=points,
                entity_ref=f"control:{control.control_ref}",
                department=department,
                finding_ref=None,
                control_ref=control.control_ref,
                audit_ref=None,
                reason=(
                    f"Control {control.control_ref} is active but "
                    f"{control.effectiveness.value}."
                ),
                evidence={
                    "control_ref": control.control_ref,
                    "effectiveness": control.effectiveness.value,
                    "category": control.category.value,
                    "last_tested_date": (
                        control.last_tested_date.isoformat()
                        if control.last_tested_date
                        else None
                    ),
                },
            )
        )

    hits.sort(
        key=lambda hit: (
            RULE_INDEX[hit.rule_id],
            hit.department.value,
            hit.entity_ref,
        )
    )
    ordered_hits = tuple(hits)

    # Context only: unresolved findings by department and severity.
    open_counts: dict[Department, dict[FindingSeverity, int]] = {
        department: dict.fromkeys(FindingSeverity, 0) for department in Department
    }
    for finding in findings:
        if finding.status not in UNRESOLVED_FINDING_STATUSES:
            continue
        department = finding_departments[finding.id]
        open_counts[department][finding.severity] += 1

    departments: list[DepartmentRisk] = []
    for department in Department:
        department_hits = tuple(
            hit for hit in ordered_hits if hit.department is department
        )
        counts = open_counts[department]
        score = sum(hit.points for hit in department_hits)
        departments.append(
            DepartmentRisk(
                department=department,
                score=score,
                band=band_for_score(score),
                hits=department_hits,
                breakdown=_breakdown_for(department_hits),
                open_findings=OpenFindingCounts(
                    low=counts[FindingSeverity.LOW],
                    medium=counts[FindingSeverity.MEDIUM],
                    high=counts[FindingSeverity.HIGH],
                    critical=counts[FindingSeverity.CRITICAL],
                ),
            )
        )

    departments.sort(key=lambda item: (-item.score, item.department.value))
    score = sum(hit.points for hit in ordered_hits)

    return PortfolioRisk(
        as_of=as_of,
        score=score,
        band=band_for_score(score),
        hits=ordered_hits,
        breakdown=_breakdown_for(ordered_hits),
        departments=tuple(departments),
    )
