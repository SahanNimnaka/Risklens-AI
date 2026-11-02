"""Read-only operational data API for the frontend.

The deterministic risk and anomaly routers answer analytical questions. The
frontend also needs the underlying audit, finding and action-plan records, so
this router exposes them as read-only lists. It does not write, change schema,
or recompute risk: finding and action risk values come from the existing
``compute_risk`` engine.

Status and effectiveness columns are current-state values, not history. The
``as_of`` date controls which findings are visible and how overdue actions are
evaluated, matching the risk engine's semantics.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import ActionPlan, Audit, Control, Finding
from app.models.enums import (
    ActionStatus,
    AuditStatus,
    AuditType,
    Department,
    FindingSeverity,
    FindingStatus,
)
from app.modules.risk_monitoring import band_for_score, compute_risk
from app.modules.risk_monitoring.engine import _completed_by
from app.schemas.audit_data import (
    ActionPlanListItem,
    ActionPlanListResponse,
    AuditListItem,
    AuditListResponse,
    FindingListItem,
    FindingListResponse,
)
from app.schemas.risk import RuleHitResponse

router = APIRouter(tags=["audit data"])

AS_OF_DESCRIPTION = (
    "Evaluation date in ISO format. Defaults to the fixed synthetic reference "
    "date (2026-10-31) so demos are reproducible."
)

UNRESOLVED_FINDING_STATUSES = frozenset(
    {FindingStatus.OPEN, FindingStatus.IN_PROGRESS}
)


@dataclass(frozen=True)
class _Snapshot:
    """Database rows loaded once per request, grouped for list building."""

    as_of: date
    audits: tuple[Audit, ...]
    findings_by_id: dict[int, Finding]
    findings_by_audit: dict[int, tuple[Finding, ...]]
    actions_by_finding: dict[int, tuple[ActionPlan, ...]]
    actions: tuple[ActionPlan, ...]
    controls_by_id: dict[int, Control]
    audit_by_id: dict[int, Audit]


def _load_snapshot(session: Session, as_of: date) -> _Snapshot:
    """Load the four tables and group them without database writes."""
    audits = session.scalars(
        select(Audit)
        .where(Audit.start_date <= as_of)
        .order_by(Audit.audit_ref)
    ).all()
    audit_by_id = {audit.id: audit for audit in audits}

    # Only findings belonging to a visible audit are relevant. Validation
    # already guarantees a finding is identified after its audit starts.
    findings = [
        finding
        for finding in session.scalars(
            select(Finding).where(Finding.identified_date <= as_of)
        ).all()
        if finding.audit_id in audit_by_id
    ]
    findings_by_id = {finding.id: finding for finding in findings}

    findings_by_audit_lists: dict[int, list[Finding]] = defaultdict(list)
    for finding in findings:
        findings_by_audit_lists[finding.audit_id].append(finding)

    actions_by_finding_lists: dict[int, list[ActionPlan]] = defaultdict(list)
    actions: list[ActionPlan] = []
    for action in session.scalars(select(ActionPlan)).all():
        if action.finding_id in findings_by_id:
            actions.append(action)
            actions_by_finding_lists[action.finding_id].append(action)

    controls = session.scalars(select(Control)).all()

    return _Snapshot(
        as_of=as_of,
        audits=tuple(audits),
        findings_by_id=findings_by_id,
        findings_by_audit={
            audit_id: tuple(items)
            for audit_id, items in findings_by_audit_lists.items()
        },
        actions_by_finding={
            finding_id: tuple(items)
            for finding_id, items in actions_by_finding_lists.items()
        },
        actions=tuple(actions),
        controls_by_id={control.id: control for control in controls},
        audit_by_id=audit_by_id,
    )


def _contains(search: str | None, *values: str | None) -> bool:
    """Case-insensitive substring match used by the list search filters."""
    if not search:
        return True
    needle = search.casefold()
    return any(value is not None and needle in value.casefold() for value in values)


def _action_is_overdue(action: ActionPlan, as_of: date) -> bool:
    return action.due_date < as_of and not _completed_by(action, as_of)


def _audit_item(
    audit: Audit,
    snapshot: _Snapshot,
) -> AuditListItem:
    findings = snapshot.findings_by_audit.get(audit.id, ())
    actions = [
        action
        for finding in findings
        for action in snapshot.actions_by_finding.get(finding.id, ())
    ]
    return AuditListItem(
        audit_ref=audit.audit_ref,
        title=audit.title,
        department=audit.department,
        audit_type=audit.audit_type,
        lead_auditor=audit.lead_auditor,
        start_date=audit.start_date,
        end_date=audit.end_date,
        status=audit.status,
        finding_count=len(findings),
        open_finding_count=sum(
            finding.status in UNRESOLVED_FINDING_STATUSES
            for finding in findings
        ),
        action_count=len(actions),
        overdue_action_count=sum(
            _action_is_overdue(action, snapshot.as_of) for action in actions
        ),
    )


def _finding_risk_index(risk) -> dict[str, tuple[object, ...]]:
    grouped: dict[str, list[object]] = defaultdict(list)
    for hit in risk.hits:
        if hit.finding_ref is not None:
            grouped[hit.finding_ref].append(hit)
    return {finding_ref: tuple(hits) for finding_ref, hits in grouped.items()}


def _action_risk_index(risk) -> dict[int, tuple[object, ...]]:
    grouped: dict[int, list[object]] = defaultdict(list)
    for hit in risk.hits:
        if hit.entity_type != "action_plan":
            continue
        action_id = hit.evidence.get("action_id")
        if isinstance(action_id, int):
            grouped[action_id].append(hit)
    return {action_id: tuple(hits) for action_id, hits in grouped.items()}


def _finding_item(
    finding: Finding,
    snapshot: _Snapshot,
    hits_by_finding: dict[str, tuple[object, ...]],
) -> FindingListItem:
    audit = snapshot.audit_by_id[finding.audit_id]
    hits = hits_by_finding.get(finding.finding_ref, ())
    score = sum(hit.points for hit in hits)
    control = snapshot.controls_by_id.get(finding.control_id)
    return FindingListItem(
        finding_ref=finding.finding_ref,
        title=finding.title,
        severity=finding.severity,
        status=finding.status,
        root_cause_category=finding.root_cause_category,
        identified_date=finding.identified_date,
        audit_ref=audit.audit_ref,
        audit_title=audit.title,
        department=audit.department,
        control_ref=control.control_ref if control is not None else None,
        action_count=len(snapshot.actions_by_finding.get(finding.id, ())),
        risk_score=score,
        risk_band=band_for_score(score),
        rule_ids=sorted({hit.rule_id for hit in hits}),
    )


def _action_item(
    action: ActionPlan,
    snapshot: _Snapshot,
    hits_by_action: dict[int, tuple[object, ...]],
) -> ActionPlanListItem:
    finding = snapshot.findings_by_id[action.finding_id]
    audit = snapshot.audit_by_id[finding.audit_id]
    hits = hits_by_action.get(action.id, ())
    overdue = _action_is_overdue(action, snapshot.as_of)
    return ActionPlanListItem(
        action_id=action.id,
        action_description=action.action_description,
        assigned_owner=action.assigned_owner,
        due_date=action.due_date,
        status=action.status,
        completion_date=action.completion_date,
        is_overdue=overdue,
        days_overdue=(
            max(0, (snapshot.as_of - action.due_date).days) if overdue else 0
        ),
        finding_ref=finding.finding_ref,
        finding_title=finding.title,
        finding_severity=finding.severity,
        finding_status=finding.status,
        audit_ref=audit.audit_ref,
        audit_title=audit.title,
        department=audit.department,
        rule_points=sum(hit.points for hit in hits),
        rule_hits=[RuleHitResponse.model_validate(hit) for hit in hits],
    )


@router.get(
    "/audits",
    response_model=AuditListResponse,
    summary="Read-only audit directory with counts",
)
def list_audits(
    as_of: date = Query(
        default=settings.synthetic_data_reference_date,
        description=AS_OF_DESCRIPTION,
    ),
    department: Department | None = Query(default=None),
    status: AuditStatus | None = Query(default=None),
    audit_type: AuditType | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_db),
) -> AuditListResponse:
    """Return audits that started by ``as_of``, newest start date first."""
    snapshot = _load_snapshot(session, as_of)
    items = [
        _audit_item(audit, snapshot)
        for audit in snapshot.audits
        if (department is None or audit.department is department)
        and (status is None or audit.status is status)
        and (audit_type is None or audit.audit_type is audit_type)
        and _contains(search, audit.audit_ref, audit.title, audit.lead_auditor)
    ]
    items.sort(key=lambda item: (-item.start_date.toordinal(), item.audit_ref))
    return AuditListResponse(as_of=as_of, total=len(items), items=items)


@router.get(
    "/findings",
    response_model=FindingListResponse,
    summary="Read-only finding directory with rule attribution",
)
def list_findings(
    as_of: date = Query(
        default=settings.synthetic_data_reference_date,
        description=AS_OF_DESCRIPTION,
    ),
    severity: FindingSeverity | None = Query(default=None),
    status: FindingStatus | None = Query(default=None),
    department: Department | None = Query(default=None),
    audit_ref: str | None = Query(default=None, max_length=32),
    rule_id: str | None = Query(default=None, max_length=64),
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_db),
) -> FindingListResponse:
    """Return findings identified by ``as_of``, newest identification first.

    ``risk_score`` and ``rule_ids`` cover only hits attributed directly to the
    finding. Department-level R4 clusters remain visible through
    ``/risk/findings/{finding_ref}`` and the department endpoints.
    """
    snapshot = _load_snapshot(session, as_of)
    hits_by_finding = _finding_risk_index(compute_risk(session, as_of))
    items = []
    for finding in snapshot.findings_by_id.values():
        audit = snapshot.audit_by_id[finding.audit_id]
        item = _finding_item(finding, snapshot, hits_by_finding)
        if severity is not None and item.severity is not severity:
            continue
        if status is not None and item.status is not status:
            continue
        if department is not None and item.department is not department:
            continue
        if audit_ref is not None and item.audit_ref != audit_ref:
            continue
        if rule_id is not None and rule_id not in item.rule_ids:
            continue
        if not _contains(
            search,
            item.finding_ref,
            item.title,
            item.audit_ref,
            item.audit_title,
        ):
            continue
        items.append(item)

    items.sort(
        key=lambda item: (-item.identified_date.toordinal(), item.finding_ref)
    )
    return FindingListResponse(as_of=as_of, total=len(items), items=items)


@router.get(
    "/actions",
    response_model=ActionPlanListResponse,
    summary="Read-only action-plan directory with overdue state",
)
def list_actions(
    as_of: date = Query(
        default=settings.synthetic_data_reference_date,
        description=AS_OF_DESCRIPTION,
    ),
    status: ActionStatus | None = Query(default=None),
    department: Department | None = Query(default=None),
    audit_ref: str | None = Query(default=None, max_length=32),
    finding_ref: str | None = Query(default=None, max_length=32),
    overdue: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    session: Session = Depends(get_db),
) -> ActionPlanListResponse:
    """Return action plans for findings identified by ``as_of``.

    ``is_overdue`` uses the same rule as R1: the due date is before ``as_of``
    and the action was not completed by then. It is computed here so the
    frontend never re-implements the rule.
    """
    snapshot = _load_snapshot(session, as_of)
    hits_by_action = _action_risk_index(compute_risk(session, as_of))
    items = []
    for action in snapshot.actions:
        item = _action_item(action, snapshot, hits_by_action)
        if status is not None and item.status is not status:
            continue
        if department is not None and item.department is not department:
            continue
        if audit_ref is not None and item.audit_ref != audit_ref:
            continue
        if finding_ref is not None and item.finding_ref != finding_ref:
            continue
        if overdue is not None and item.is_overdue is not overdue:
            continue
        if not _contains(
            search,
            item.action_description,
            item.assigned_owner,
            item.finding_ref,
            item.audit_ref,
        ):
            continue
        items.append(item)

    items.sort(key=lambda item: (item.due_date.toordinal(), item.action_id))
    return ActionPlanListResponse(as_of=as_of, total=len(items), items=items)
