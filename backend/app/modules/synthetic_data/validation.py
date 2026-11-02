"""Validation for the generated synthetic dataset.

Three kinds of checks run here:

1. Structural integrity - unique natural keys, no orphan rows, valid enums.
2. Temporal consistency - dates inside audit windows, remediation after
   identification, no completions in the future.
3. Business coverage - the dataset must actually contain overdue actions,
   blocked remediation, unresolved criticals, weak-control findings, audits
   with several findings, and recurring root causes.

The generator is only considered successful if all three pass. Validation
runs against the in-memory frames and never touches the database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

import pandas as pd

from app.models.enums import (
    ActionStatus,
    AuditStatus,
    AuditType,
    ControlCategory,
    ControlEffectiveness,
    ControlFrequency,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.synthetic_data.generator import DatasetBundle

RECURRENCE_WINDOW_DAYS = 180
RECURRENCE_MIN_COUNT = 3


class DatasetValidationError(ValueError):
    """Raised when the generated dataset breaks an integrity or coverage rule."""

    def __init__(self, issues: list[str]) -> None:
        self.issues = issues
        super().__init__(
            f"Synthetic dataset validation failed with {len(issues)} issue(s):\n- "
            + "\n- ".join(issues)
        )


@dataclass(frozen=True)
class DatasetReport:
    seed: int
    reference_date: date
    counts: dict[str, int]
    occurrence_range: tuple[date, date]
    severity_counts: dict[str, int]
    finding_status_counts: dict[str, int]
    action_status_counts: dict[str, int]
    overdue_actions: int
    blocked_actions: int
    completed_actions: int
    critical_unresolved: int
    ineffective_control_findings: int
    weak_control_findings: int
    multi_finding_audits: int
    recurrence_clusters: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "seed": self.seed,
            "reference_date": self.reference_date.isoformat(),
            "counts": self.counts,
            "occurrence_range": [d.isoformat() for d in self.occurrence_range],
            "severity_counts": self.severity_counts,
            "finding_status_counts": self.finding_status_counts,
            "action_status_counts": self.action_status_counts,
            "overdue_actions": self.overdue_actions,
            "blocked_actions": self.blocked_actions,
            "completed_actions": self.completed_actions,
            "critical_unresolved": self.critical_unresolved,
            "ineffective_control_findings": self.ineffective_control_findings,
            "weak_control_findings": self.weak_control_findings,
            "multi_finding_audits": self.multi_finding_audits,
            "recurrence_clusters": self.recurrence_clusters,
        }


def validate_dataset(bundle: DatasetBundle) -> DatasetReport:
    """Validate structural, temporal and coverage rules; return a report."""
    audits = bundle.audits
    controls = bundle.controls
    findings = bundle.findings
    actions = bundle.action_plans
    reference = pd.Timestamp(bundle.reference_date)
    issues: list[str] = []

    for name, frame, key in (
        ("audits", audits, "audit_ref"),
        ("controls", controls, "control_ref"),
        ("findings", findings, "finding_ref"),
    ):
        if frame.empty:
            issues.append(f"{name} is empty")
        if frame[key].isna().any():
            issues.append(f"{name} contains null {key}")
        duplicates = frame[key][frame[key].duplicated()].tolist()
        if duplicates:
            issues.append(f"{name} contains duplicate {key}: {duplicates[:5]}")

    # Every later check joins on these keys. Pandas would raise a MergeError
    # on duplicate or missing keys, hiding the actual problem, so stop here
    # and report the structural issues we already found.
    if issues:
        raise DatasetValidationError(issues)

    _check_enum(audits, "department", Department, issues)
    _check_enum(audits, "audit_type", AuditType, issues)
    _check_enum(audits, "status", AuditStatus, issues)
    _check_enum(controls, "department", Department, issues)
    _check_enum(controls, "category", ControlCategory, issues)
    _check_enum(controls, "frequency", ControlFrequency, issues)
    _check_enum(controls, "status", ControlStatus, issues)
    _check_enum(controls, "effectiveness", ControlEffectiveness, issues)
    _check_enum(findings, "severity", FindingSeverity, issues)
    _check_enum(findings, "status", FindingStatus, issues)
    _check_enum(findings, "root_cause_category", RootCauseCategory, issues)
    _check_enum(actions, "status", ActionStatus, issues)

    orphan_audits = set(findings["audit_ref"]) - set(audits["audit_ref"])
    if orphan_audits:
        issues.append(f"findings reference unknown audits: {sorted(orphan_audits)[:5]}")

    orphan_controls = set(findings["control_ref"].dropna()) - set(
        controls["control_ref"]
    )
    if orphan_controls:
        issues.append(f"findings reference unknown controls: {sorted(orphan_controls)[:5]}")

    orphan_findings = set(actions["finding_ref"]) - set(findings["finding_ref"])
    if orphan_findings:
        issues.append(
            f"action plans reference unknown findings: {sorted(orphan_findings)[:5]}"
        )

    if (audits["end_date"].notna() & (audits["end_date"] < audits["start_date"])).any():
        issues.append("some audits end before they start")

    findings_with_audit = findings.merge(
        audits[["audit_ref", "department", "start_date", "end_date"]],
        on="audit_ref",
        how="left",
        validate="many_to_one",
    )
    before_start = findings_with_audit["identified_date"] < findings_with_audit["start_date"]
    if before_start.any():
        issues.append(
            f"{int(before_start.sum())} finding(s) identified before their audit started"
        )
    after_end = (
        findings_with_audit["end_date"].notna()
        & (findings_with_audit["identified_date"] > findings_with_audit["end_date"])
    )
    if after_end.any():
        issues.append(
            f"{int(after_end.sum())} finding(s) identified after their audit ended"
        )

    actions_with_finding = actions.merge(
        findings[["finding_ref", "identified_date"]],
        on="finding_ref",
        how="left",
        validate="many_to_one",
    )
    due_before_identified = (
        actions_with_finding["due_date"] < actions_with_finding["identified_date"]
    )
    if due_before_identified.any():
        issues.append(
            f"{int(due_before_identified.sum())} action(s) due before the finding was identified"
        )

    completed_without_date = (
        actions["status"] == ActionStatus.COMPLETED.value
    ) & actions["completion_date"].isna()
    if completed_without_date.any():
        issues.append(
            f"{int(completed_without_date.sum())} completed action(s) have no completion date"
        )

    completion_before_identified = (
        actions_with_finding["completion_date"].notna()
        & (
            actions_with_finding["completion_date"]
            < actions_with_finding["identified_date"]
        )
    )
    if completion_before_identified.any():
        issues.append(
            f"{int(completion_before_identified.sum())} action(s) completed before the finding was identified"
        )

    future_completions = actions["completion_date"].notna() & (
        actions["completion_date"] > reference
    )
    if future_completions.any():
        issues.append(
            f"{int(future_completions.sum())} action(s) completed after the reference date"
        )

    non_completed_with_date = (
        actions["status"] != ActionStatus.COMPLETED.value
    ) & actions["completion_date"].notna()
    if non_completed_with_date.any():
        issues.append(
            f"{int(non_completed_with_date.sum())} non-completed action(s) carry a completion date"
        )

    resolved_without_completed_action = _resolved_without_completed_action(
        findings, actions
    )
    if resolved_without_completed_action:
        issues.append(
            f"{len(resolved_without_completed_action)} resolved finding(s) have no completed action"
        )

    misplaced_controls = _findings_with_foreign_department_control(
        findings_with_audit, controls
    )
    if misplaced_controls:
        issues.append(
            f"{len(misplaced_controls)} finding(s) link to a control in another department"
        )

    clusters = _recurrence_clusters(findings_with_audit)

    overdue = actions[
        (actions["status"] != ActionStatus.COMPLETED.value)
        & (actions["due_date"] < reference)
    ]
    blocked = actions[actions["status"] == ActionStatus.BLOCKED.value]
    completed = actions[actions["status"] == ActionStatus.COMPLETED.value]
    critical_unresolved = findings[
        (findings["severity"] == FindingSeverity.CRITICAL.value)
        & (findings["status"].isin([FindingStatus.OPEN.value, FindingStatus.IN_PROGRESS.value]))
    ]

    weak_controls = controls[
        controls["effectiveness"].isin(
            [
                ControlEffectiveness.INEFFECTIVE.value,
                ControlEffectiveness.PARTIALLY_EFFECTIVE.value,
            ]
        )
    ]
    ineffective_controls = controls[
        controls["effectiveness"] == ControlEffectiveness.INEFFECTIVE.value
    ]
    weak_control_findings = findings[
        findings["control_ref"].isin(weak_controls["control_ref"])
    ]
    ineffective_control_findings = findings[
        findings["control_ref"].isin(ineffective_controls["control_ref"])
    ]
    multi_finding_audits = int(
        (findings.groupby("audit_ref").size() >= 2).sum()
    )

    if len(critical_unresolved) == 0:
        issues.append("coverage: no unresolved critical findings")
    if overdue.empty:
        issues.append("coverage: no overdue action plans")
    if blocked.empty:
        issues.append("coverage: no blocked action plans")
    if completed.empty:
        issues.append("coverage: no completed action plans")
    if ineffective_control_findings.empty:
        issues.append("coverage: no findings linked to ineffective controls")
    if multi_finding_audits == 0:
        issues.append("coverage: no audit has more than one finding")
    if len(clusters) < 2:
        issues.append(
            f"coverage: expected at least 2 recurring root-cause clusters, found {len(clusters)}"
        )
    if findings_with_audit["department"].nunique() < 6:
        issues.append("coverage: not every department has findings")

    if issues:
        raise DatasetValidationError(issues)

    severity_counts = {
        severity.value: int((findings["severity"] == severity.value).sum())
        for severity in FindingSeverity
    }
    finding_status_counts = {
        status.value: int((findings["status"] == status.value).sum())
        for status in FindingStatus
    }
    action_status_counts = {
        status.value: int((actions["status"] == status.value).sum())
        for status in ActionStatus
    }

    return DatasetReport(
        seed=bundle.seed,
        reference_date=bundle.reference_date,
        counts={
            "audits": len(audits),
            "controls": len(controls),
            "findings": len(findings),
            "action_plans": len(actions),
        },
        occurrence_range=(
            findings["identified_date"].min().date(),
            findings["identified_date"].max().date(),
        ),
        severity_counts=severity_counts,
        finding_status_counts=finding_status_counts,
        action_status_counts=action_status_counts,
        overdue_actions=len(overdue),
        blocked_actions=len(blocked),
        completed_actions=len(completed),
        critical_unresolved=len(critical_unresolved),
        ineffective_control_findings=len(ineffective_control_findings),
        weak_control_findings=len(weak_control_findings),
        multi_finding_audits=multi_finding_audits,
        recurrence_clusters=clusters,
    )


def _check_enum(frame: pd.DataFrame, column: str, enum_cls, issues: list[str]) -> None:
    allowed = {member.value for member in enum_cls}
    present = {str(value) for value in frame[column].dropna()}
    invalid = sorted(present - allowed)
    if invalid:
        issues.append(f"{column} has invalid values {invalid} (allowed: {sorted(allowed)})")


def _resolved_without_completed_action(
    findings: pd.DataFrame, actions: pd.DataFrame
) -> list[str]:
    resolved = set(
        findings.loc[findings["status"] == FindingStatus.RESOLVED.value, "finding_ref"]
    )
    completed = set(
        actions.loc[actions["status"] == ActionStatus.COMPLETED.value, "finding_ref"]
    )
    return sorted(resolved - completed)


def _findings_with_foreign_department_control(
    findings_with_audit: pd.DataFrame, controls: pd.DataFrame
) -> list[str]:
    merged = findings_with_audit.dropna(subset=["control_ref"]).merge(
        controls[["control_ref", "department"]],
        on="control_ref",
        how="left",
        suffixes=("", "_control"),
        validate="many_to_one",
    )
    mismatched = merged[merged["department"] != merged["department_control"]]
    return mismatched["finding_ref"].tolist()


def _recurrence_clusters(
    findings_with_audit: pd.DataFrame,
    window_days: int = RECURRENCE_WINDOW_DAYS,
    min_count: int = RECURRENCE_MIN_COUNT,
) -> list[dict[str, Any]]:
    """One cluster per department/root-cause pair with enough findings in a window."""
    clusters: list[dict[str, Any]] = []
    grouped = findings_with_audit.sort_values("identified_date").groupby(
        ["department", "root_cause_category"], sort=True
    )

    for (department, root_cause), group in grouped:
        dates = group["identified_date"].tolist()
        refs = group["finding_ref"].tolist()
        for index, start in enumerate(dates):
            window_end = start + pd.Timedelta(days=window_days)
            members = [
                (identified, ref)
                for identified, ref in zip(dates[index:], refs[index:])
                if identified <= window_end
            ]
            if len(members) >= min_count:
                clusters.append(
                    {
                        "department": str(department),
                        "root_cause_category": str(root_cause),
                        "window_start": members[0][0].date().isoformat(),
                        "window_end": members[-1][0].date().isoformat(),
                        "count": len(members),
                        "finding_refs": [ref for _, ref in members],
                    }
                )
                break

    return clusters
