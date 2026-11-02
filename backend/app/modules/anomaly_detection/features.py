"""Audit-level feature construction for supplementary anomaly detection.

The feature frame is built from the same four Phase 1 tables as the rule
engine, using the same ``as_of`` semantics:

* audits are considered when ``start_date <= as_of``;
* findings are considered when ``identified_date <= as_of``;
* an action counts as completed by ``as_of`` when its ``completion_date`` is on
  or before ``as_of`` or its current status is ``completed``.

Only audits with at least one finding are eligible. Audits with no findings are
statistically easy to isolate but not meaningful for a risk-relevant anomaly
view, so they are excluded here rather than left for the model to explain.

The frame is a plain :class:`pandas.DataFrame` so the detector can normalize and
score it without any database access. No rule points, bands or risk scores are
included: those are joined later, for context only, and are never model inputs.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from statistics import fmean
from typing import Final

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActionPlan, Audit, Control, Finding
from app.models.enums import (
    ActionStatus,
    ControlEffectiveness,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
)

#: Ordered feature names. The order is part of the model contract: it keeps
#: arrays, explanations and API payloads stable across runs.
FEATURE_NAMES: Final[tuple[str, ...]] = (
    "finding_count",
    "critical_unresolved_count",
    "high_critical_share",
    "overdue_action_rate",
    "mean_days_overdue",
    "blocked_action_count",
    "weak_control_finding_share",
    "unactioned_finding_share",
    "resolved_share",
    "root_cause_diversity",
    "mean_remediation_window_days",
)

UNRESOLVED_FINDING_STATUSES: Final[frozenset[FindingStatus]] = frozenset(
    {FindingStatus.OPEN, FindingStatus.IN_PROGRESS}
)

WEAK_CONTROL_EFFECTIVENESS: Final[frozenset[ControlEffectiveness]] = frozenset(
    {ControlEffectiveness.INEFFECTIVE, ControlEffectiveness.PARTIALLY_EFFECTIVE}
)

BASE_COLUMNS: Final[tuple[str, ...]] = (
    "audit_ref",
    "department",
    "audit_title",
)


def _completed_by(action: ActionPlan, as_of: date) -> bool:
    """True when the action was already completed on the as-of date.

    Mirrors ``app.modules.risk_monitoring.engine._completed_by`` so anomaly
    features and rule hits agree on what "completed" means.
    """
    if action.status is ActionStatus.COMPLETED:
        return True
    return action.completion_date is not None and action.completion_date <= as_of


def _median_fill(values: pd.Series) -> pd.Series:
    """Fill nulls with the series median, leaving all-null series unchanged."""
    median = values.median()
    if pd.isna(median):
        return values
    return values.fillna(median)


def build_feature_frame(session: Session, as_of: date) -> pd.DataFrame:
    """Return one feature row per eligible audit at ``as_of``.

    The result is sorted by ``audit_ref`` so that repeated calls and model
    fitting are deterministic for identical database contents.
    """
    audits = session.scalars(
        select(Audit)
        .where(Audit.start_date <= as_of)
        .order_by(Audit.audit_ref)
    ).all()
    controls = session.scalars(select(Control)).all()
    findings = session.scalars(
        select(Finding).where(Finding.identified_date <= as_of)
    ).all()
    actions = session.scalars(select(ActionPlan)).all()

    findings_by_audit: dict[int, list[Finding]] = defaultdict(list)
    for finding in findings:
        findings_by_audit[finding.audit_id].append(finding)

    actions_by_finding: dict[int, list[ActionPlan]] = defaultdict(list)
    for action in actions:
        actions_by_finding[action.finding_id].append(action)

    weak_control_ids = {
        control.id
        for control in controls
        if control.status is ControlStatus.ACTIVE
        and control.effectiveness in WEAK_CONTROL_EFFECTIVENESS
    }

    rows: list[dict[str, object]] = []
    for audit in audits:
        audit_findings = findings_by_audit.get(audit.id, [])
        if not audit_findings:
            continue

        audit_actions = [
            action
            for finding in audit_findings
            for action in actions_by_finding.get(finding.id, [])
        ]

        overdue = [
            action
            for action in audit_actions
            if action.due_date < as_of and not _completed_by(action, as_of)
        ]
        blocked = [
            action
            for action in audit_actions
            if action.status is ActionStatus.BLOCKED
            and not _completed_by(action, as_of)
        ]
        critical_unresolved = [
            finding
            for finding in audit_findings
            if finding.severity is FindingSeverity.CRITICAL
            and finding.status in UNRESOLVED_FINDING_STATUSES
        ]
        high_or_critical = [
            finding
            for finding in audit_findings
            if finding.severity in {FindingSeverity.HIGH, FindingSeverity.CRITICAL}
        ]
        weak_findings = [
            finding
            for finding in audit_findings
            if finding.control_id in weak_control_ids
        ]
        action_required = [
            finding
            for finding in audit_findings
            if finding.status is not FindingStatus.ACCEPTED
        ]
        unactioned = [
            finding
            for finding in action_required
            if not actions_by_finding.get(finding.id)
        ]
        root_causes = {finding.root_cause_category for finding in audit_findings}
        remediation_windows = [
            (action.due_date - finding.identified_date).days
            for finding in audit_findings
            for action in actions_by_finding.get(finding.id, [])
        ]
        finding_count = len(audit_findings)
        overdue_days = [(as_of - action.due_date).days for action in overdue]

        rows.append(
            {
                "audit_ref": audit.audit_ref,
                "department": Department(audit.department).value,
                "audit_title": audit.title,
                "finding_count": finding_count,
                "critical_unresolved_count": len(critical_unresolved),
                "high_critical_share": (
                    len(high_or_critical) / finding_count
                ),
                "overdue_action_rate": (
                    len(overdue) / len(audit_actions) if audit_actions else 0.0
                ),
                "mean_days_overdue": (
                    fmean(overdue_days) if overdue_days else 0.0
                ),
                "blocked_action_count": len(blocked),
                "weak_control_finding_share": (
                    len(weak_findings) / finding_count
                ),
                "unactioned_finding_share": (
                    len(unactioned) / len(action_required)
                    if action_required
                    else 0.0
                ),
                "resolved_share": (
                    sum(
                        finding.status is FindingStatus.RESOLVED
                        for finding in audit_findings
                    )
                    / finding_count
                ),
                "root_cause_diversity": len(root_causes) / finding_count,
                "mean_remediation_window_days": (
                    fmean(remediation_windows) if remediation_windows else None
                ),
            }
        )

    if not rows:
        return pd.DataFrame(columns=[*BASE_COLUMNS, *FEATURE_NAMES])

    frame = pd.DataFrame(rows).sort_values("audit_ref").reset_index(drop=True)

    # Neutral imputation: an audit with no actions receives its department's
    # median remediation window, then the global median, then zero.
    frame["mean_remediation_window_days"] = frame.groupby("department")[
        "mean_remediation_window_days"
    ].transform(_median_fill)
    frame["mean_remediation_window_days"] = _median_fill(
        frame["mean_remediation_window_days"]
    ).fillna(0.0)

    return frame
