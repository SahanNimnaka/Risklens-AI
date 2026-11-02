"""Deterministic synthetic dataset generator.

Design rules:

* One seed controls every random choice, so the same seed produces identical
  output every run.
* Every record is plausible for the business context: dates sit inside audit
  windows, remediation follows severity, resolved findings have completed
  actions, and accepted risks do not get action plans.
* Risk is not uniform. Procurement and IT carry more findings, more criticals,
  weaker controls, slower remediation and more overdue or blocked actions.
* Each department has a recurring root cause, so Rule 4 (repeated findings)
  has genuine signal rather than noise.

No database access happens here. The loader in ``loader.py`` maps the natural
keys (``audit_ref``, ``control_ref``, ``finding_ref``) to database ids.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Sequence, TypeVar

import numpy as np
import pandas as pd

from app.core.config import settings
from app.models.enums import (
    ActionStatus,
    AuditStatus,
    AuditType,
    ControlEffectiveness,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.synthetic_data.catalog import (
    AUDIT_TITLE_TEMPLATES,
    CATEGORY_LABELS,
    CONTROL_TEMPLATES,
    DEPARTMENT_AUDIT_TYPES,
    DEPARTMENT_CODES,
    DEPARTMENT_LABELS,
    DEPARTMENT_OWNERS,
    DEPARTMENT_PROFILES,
    FINDING_TEMPLATES,
    HISTORY_DAYS,
    LEAD_AUDITORS,
    REMEDIATION_DAYS_BY_SEVERITY,
    ROOT_CAUSE_BY_CATEGORY,
    ControlTemplate,
    DepartmentProfile,
)

T = TypeVar("T")

DEFAULT_TOTAL_AUDITS = 60

AUDIT_COLUMNS = [
    "audit_ref",
    "title",
    "department",
    "audit_type",
    "lead_auditor",
    "start_date",
    "end_date",
    "status",
]
CONTROL_COLUMNS = [
    "control_ref",
    "name",
    "description",
    "department",
    "category",
    "owner",
    "frequency",
    "status",
    "effectiveness",
    "last_tested_date",
]
FINDING_COLUMNS = [
    "finding_ref",
    "audit_ref",
    "control_ref",
    "title",
    "description",
    "severity",
    "status",
    "root_cause_category",
    "evidence_reference",
    "identified_date",
]
ACTION_COLUMNS = [
    "finding_ref",
    "action_description",
    "assigned_owner",
    "due_date",
    "status",
    "completion_date",
]

AVG_FINDING_JITTER = 1.2

SEVERITY_ORDER = [
    FindingSeverity.LOW,
    FindingSeverity.MEDIUM,
    FindingSeverity.HIGH,
    FindingSeverity.CRITICAL,
]


@dataclass(frozen=True)
class DatasetBundle:
    """The four generated tables plus the settings that produced them."""

    audits: pd.DataFrame
    controls: pd.DataFrame
    findings: pd.DataFrame
    action_plans: pd.DataFrame
    seed: int
    reference_date: date


def _weighted_choice(
    rng: np.random.Generator, items: Sequence[T], weights: Sequence[float]
) -> T:
    """Pick from ``items`` using relative weights, preserving Python objects."""
    probabilities = np.asarray(weights, dtype=float)
    probabilities = probabilities / probabilities.sum()
    return items[int(rng.choice(len(items), p=probabilities))]


def _upgrade_severity(severity: FindingSeverity) -> FindingSeverity:
    index = SEVERITY_ORDER.index(severity)
    return SEVERITY_ORDER[min(index + 1, len(SEVERITY_ORDER) - 1)]


def _sentence_case(text: str) -> str:
    """Capitalise the first character only, leaving the rest untouched."""
    return text[:1].upper() + text[1:] if text else text


class SyntheticDatasetGenerator:
    """Generate the fictional audit dataset in memory."""

    def __init__(
        self,
        seed: int | None = None,
        reference_date: date | None = None,
        total_audits: int = DEFAULT_TOTAL_AUDITS,
    ) -> None:
        self.seed = settings.synthetic_data_seed if seed is None else seed
        self.reference_date = (
            settings.synthetic_data_reference_date
            if reference_date is None
            else reference_date
        )
        self.total_audits = total_audits
        self._rng = np.random.default_rng(self.seed)
        self._audit_sequence: dict[int, int] = {}
        self._finding_sequence: dict[int, int] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def generate(self) -> DatasetBundle:
        controls = self._build_controls()
        audits = self._build_audits()
        findings, action_plans = self._build_findings_and_actions(audits, controls)

        return DatasetBundle(
            audits=self._to_frame(audits, AUDIT_COLUMNS, ["start_date", "end_date"]),
            controls=self._to_frame(controls, CONTROL_COLUMNS, ["last_tested_date"]),
            findings=self._to_frame(findings, FINDING_COLUMNS, ["identified_date"]),
            action_plans=self._to_frame(
                action_plans,
                ACTION_COLUMNS,
                ["due_date", "completion_date"],
            ),
            seed=self.seed,
            reference_date=self.reference_date,
        )

    # ------------------------------------------------------------------
    # Controls
    # ------------------------------------------------------------------
    def _build_controls(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for department in DEPARTMENT_PROFILES:
            code = DEPARTMENT_CODES[department]
            profile = DEPARTMENT_PROFILES[department]
            for sequence, template in enumerate(
                CONTROL_TEMPLATES[department], start=1
            ):
                effectiveness, tested = self._control_effectiveness(
                    profile.effective_rate
                )
                rows.append(
                    {
                        "control_ref": f"CTL-{code}-{sequence:03d}",
                        "name": template.name,
                        "description": template.description,
                        "department": department,
                        "category": template.category,
                        "owner": str(self._rng.choice(DEPARTMENT_OWNERS[department])),
                        "frequency": template.frequency,
                        "status": self._control_status(),
                        "effectiveness": effectiveness,
                        "last_tested_date": tested,
                        # Internal helper, not persisted.
                        "_template": template,
                    }
                )
        return rows

    def _control_effectiveness(
        self, effective_rate: float
    ) -> tuple[ControlEffectiveness, date | None]:
        roll = self._rng.random()
        if roll < 0.06:
            return ControlEffectiveness.NOT_TESTED, None
        if roll < 0.06 + effective_rate:
            effectiveness = ControlEffectiveness.EFFECTIVE
        elif roll < 0.06 + effective_rate + (1 - effective_rate) * 0.40:
            effectiveness = ControlEffectiveness.PARTIALLY_EFFECTIVE
        else:
            effectiveness = ControlEffectiveness.INEFFECTIVE

        tested = self.reference_date - timedelta(days=int(self._rng.integers(10, 240)))
        return effectiveness, tested

    def _control_status(self) -> ControlStatus:
        roll = self._rng.random()
        if roll < 0.88:
            return ControlStatus.ACTIVE
        if roll < 0.96:
            return ControlStatus.INACTIVE
        return ControlStatus.RETIRED

    # ------------------------------------------------------------------
    # Audits
    # ------------------------------------------------------------------
    def _build_audits(self) -> list[dict[str, object]]:
        allocation = self._allocate_audits()
        rows: list[dict[str, object]] = []

        for department in DEPARTMENT_PROFILES:
            for _ in range(allocation[department]):
                start = self.reference_date - timedelta(
                    days=int(self._rng.integers(7, HISTORY_DAYS))
                )
                duration = int(self._rng.integers(21, 46))
                end = start + timedelta(days=duration)

                if end > self.reference_date:
                    end = None
                    status = AuditStatus.IN_PROGRESS
                elif self._rng.random() < 0.04:
                    status = AuditStatus.CANCELLED
                else:
                    status = AuditStatus.COMPLETED

                audit_types = DEPARTMENT_AUDIT_TYPES[department]
                audit_type = _weighted_choice(
                    self._rng,
                    list(audit_types),
                    list(audit_types.values()),
                )
                template = str(self._rng.choice(AUDIT_TITLE_TEMPLATES[audit_type]))
                title = (
                    template.format(department=DEPARTMENT_LABELS[department])
                    + f" ({start.year} Q{(start.month - 1) // 3 + 1})"
                )

                rows.append(
                    {
                        "audit_ref": None,
                        "title": title,
                        "department": department,
                        "audit_type": audit_type,
                        "lead_auditor": str(self._rng.choice(LEAD_AUDITORS)),
                        "start_date": start,
                        "end_date": end,
                        "status": status,
                    }
                )

        rows.sort(key=lambda row: (row["start_date"], str(row["department"])))
        for row in rows:
            start: date = row["start_date"]  # type: ignore[assignment]
            sequence = self._audit_sequence.get(start.year, 0) + 1
            self._audit_sequence[start.year] = sequence
            row["audit_ref"] = f"AUD-{start.year}-{sequence:04d}"

        return rows

    def _allocate_audits(self) -> dict[Department, int]:
        weights = {
            department: profile.audit_weight
            for department, profile in DEPARTMENT_PROFILES.items()
        }
        total_weight = sum(weights.values())
        raw = {
            department: self.total_audits * weight / total_weight
            for department, weight in weights.items()
        }
        allocation = {department: int(value) for department, value in raw.items()}
        remainder = self.total_audits - sum(allocation.values())
        ranked = sorted(
            raw,
            key=lambda department: (
                -(raw[department] - allocation[department]),
                department.value,
            ),
        )
        for department in ranked[:remainder]:
            allocation[department] += 1
        return allocation

    # ------------------------------------------------------------------
    # Findings and action plans
    # ------------------------------------------------------------------
    def _build_findings_and_actions(
        self,
        audits: list[dict[str, object]],
        controls: list[dict[str, object]],
    ) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
        findings: list[dict[str, object]] = []
        actions: list[dict[str, object]] = []
        controls_by_department = self._group_controls(controls)

        for audit in audits:
            department: Department = audit["department"]  # type: ignore[assignment]
            profile = DEPARTMENT_PROFILES[department]
            status = audit["status"]

            if status is AuditStatus.CANCELLED:
                continue

            count = max(
                0,
                int(
                    round(
                        self._rng.normal(
                            profile.avg_findings_per_audit, AVG_FINDING_JITTER
                        )
                    )
                ),
            )
            if status is AuditStatus.IN_PROGRESS:
                count = min(count, 3)

            for position in range(1, count + 1):
                finding = self._build_finding(
                    audit, position, controls_by_department[department]
                )
                findings.append(finding)
                actions.extend(self._build_actions(finding, profile))

        return findings, actions

    def _group_controls(
        self, controls: list[dict[str, object]]
    ) -> dict[Department, list[dict[str, object]]]:
        grouped: dict[Department, list[dict[str, object]]] = {
            department: [] for department in DEPARTMENT_PROFILES
        }
        for control in controls:
            department: Department = control["department"]  # type: ignore[assignment]
            grouped[department].append(control)
        return grouped

    def _build_finding(
        self,
        audit: dict[str, object],
        position: int,
        department_controls: list[dict[str, object]],
    ) -> dict[str, object]:
        department: Department = audit["department"]  # type: ignore[assignment]
        profile = DEPARTMENT_PROFILES[department]
        start: date = audit["start_date"]  # type: ignore[assignment]
        end: date | None = audit["end_date"]  # type: ignore[assignment]

        latest = (end - start).days - 1 if end is not None else (self.reference_date - start).days
        identified = start + timedelta(days=int(self._rng.integers(4, max(5, latest))))

        candidate = self._choose_control(department_controls)
        linked_control = (
            candidate
            if candidate is not None and self._rng.random() < 0.72
            else None
        )
        template = self._choose_template(department_controls, linked_control)
        area = CATEGORY_LABELS[template.category]

        root_cause = self._choose_root_cause(
            template.category,
            profile.repeated_root_cause,
            linked=linked_control is not None,
        )
        severity = _weighted_choice(
            self._rng,
            list(profile.severity_weights),
            list(profile.severity_weights.values()),
        )
        if linked_control is not None:
            effectiveness = linked_control["effectiveness"]
            if (
                effectiveness is ControlEffectiveness.INEFFECTIVE
                and self._rng.random() < 0.5
            ):
                severity = _upgrade_severity(severity)
            elif (
                effectiveness is ControlEffectiveness.PARTIALLY_EFFECTIVE
                and self._rng.random() < 0.25
            ):
                severity = _upgrade_severity(severity)

        finding_status = self._finding_status(identified, severity)
        finding_template = FINDING_TEMPLATES[root_cause]
        sample = int(self._rng.integers(4, 21))
        exceptions = int(self._rng.integers(1, max(2, sample - 1)))
        context = {
            "area": area,
            "control": template.name.lower(),
            "sample": sample,
            "exceptions": exceptions,
        }

        year = identified.year
        sequence = self._finding_sequence.get(year, 0) + 1
        self._finding_sequence[year] = sequence

        audit_ref = str(audit["audit_ref"])
        title = str(self._rng.choice(finding_template.titles)).format(**context)
        description = finding_template.description.format(**context)
        return {
            "finding_ref": f"FND-{year}-{sequence:04d}",
            "audit_ref": audit_ref,
            "control_ref": linked_control["control_ref"] if linked_control else None,
            "title": _sentence_case(title),
            "description": _sentence_case(description),
            "severity": severity,
            "status": finding_status,
            "root_cause_category": root_cause,
            "evidence_reference": f"WP-{audit_ref[4:]}-{position:02d}",
            "identified_date": identified,
            # Internal helpers, not persisted.
            "_template": template,
        }

    def _choose_control(
        self, department_controls: list[dict[str, object]]
    ) -> dict[str, object] | None:
        if not department_controls:
            return None
        weights = {
            ControlEffectiveness.INEFFECTIVE: 2.5,
            ControlEffectiveness.PARTIALLY_EFFECTIVE: 1.6,
            ControlEffectiveness.EFFECTIVE: 1.0,
            ControlEffectiveness.NOT_TESTED: 1.2,
        }
        return _weighted_choice(
            self._rng,
            department_controls,
            [
                weights[control["effectiveness"]]  # type: ignore[index]
                for control in department_controls
            ],
        )

    def _choose_template(
        self,
        department_controls: list[dict[str, object]],
        linked_control: dict[str, object] | None,
    ) -> ControlTemplate:
        if linked_control is not None:
            return linked_control["_template"]  # type: ignore[return-value]
        index = int(self._rng.integers(0, len(department_controls)))
        return department_controls[index]["_template"]  # type: ignore[return-value]

    def _choose_root_cause(
        self,
        category,
        repeated: RootCauseCategory,
        *,
        linked: bool,
    ) -> RootCauseCategory:
        if linked:
            options = list(ROOT_CAUSE_BY_CATEGORY[category])
            weights = [0.55 if option is repeated else 0.15 for option in options]
        else:
            options = list(RootCauseCategory)
            weights = [0.40 if option is repeated else 0.10 for option in options]
        return _weighted_choice(self._rng, options, weights)

    def _finding_status(
        self, identified: date, severity: FindingSeverity
    ) -> FindingStatus:
        age = (self.reference_date - identified).days
        if age > 270:
            probabilities = [0.78, 0.07, 0.10, 0.05]
        elif age > 120:
            probabilities = [0.55, 0.10, 0.25, 0.10]
        elif age > 45:
            probabilities = [0.25, 0.10, 0.35, 0.30]
        else:
            probabilities = [0.05, 0.05, 0.40, 0.50]

        if severity is FindingSeverity.CRITICAL:
            # Critical findings stay open longer than the base ageing curve.
            probabilities[0] *= 0.6
            probabilities[3] *= 1.4

        options = [
            FindingStatus.RESOLVED,
            FindingStatus.ACCEPTED,
            FindingStatus.IN_PROGRESS,
            FindingStatus.OPEN,
        ]
        return _weighted_choice(self._rng, options, probabilities)

    def _build_actions(
        self,
        finding: dict[str, object],
        profile: DepartmentProfile,
    ) -> list[dict[str, object]]:
        status = finding["status"]
        if status is FindingStatus.ACCEPTED:
            return []
        if status is not FindingStatus.RESOLVED and self._rng.random() < 0.12:
            return []

        identified: date = finding["identified_date"]  # type: ignore[assignment]
        severity: FindingSeverity = finding["severity"]  # type: ignore[assignment]
        base_days = REMEDIATION_DAYS_BY_SEVERITY[severity] * profile.remediation_speed
        due = identified + timedelta(
            days=max(14, int(base_days) + int(self._rng.integers(-5, 11)))
        )

        root_cause: RootCauseCategory = finding["root_cause_category"]  # type: ignore[assignment]
        template = finding["_template"]  # type: ignore[assignment]
        area = CATEGORY_LABELS[template.category]  # type: ignore[union-attr]
        description = FINDING_TEMPLATES[root_cause].action.format(area=area)
        owner = str(self._rng.choice(DEPARTMENT_OWNERS[profile.department]))

        rows: list[dict[str, object]] = []

        if status is FindingStatus.RESOLVED:
            # A resolved finding cannot have a due date in the future; clamp it
            # to the reference date so completion dates stay meaningful.
            due = min(due, self.reference_date)
            late = self._rng.random() < 0.20
            offset = (
                int(self._rng.integers(1, 31))
                if late
                else -int(self._rng.integers(0, 11))
            )
            completion = due + timedelta(days=offset)
            completion = min(completion, self.reference_date)
            completion = max(completion, identified)
            rows.append(
                self._action_row(
                    finding,
                    description,
                    owner,
                    due,
                    ActionStatus.COMPLETED,
                    completion,
                )
            )
            return rows

        if due < self.reference_date:
            blocked_threshold = profile.overdue_rate * 0.45 + profile.blocked_bonus
            roll = self._rng.random()
            if roll < blocked_threshold:
                rows.append(
                    self._action_row(
                        finding, description, owner, due, ActionStatus.BLOCKED, None
                    )
                )
                return rows
            if roll < blocked_threshold + 0.12:
                completion = min(
                    due + timedelta(days=int(self._rng.integers(2, 41))),
                    self.reference_date,
                )
                rows.append(
                    self._action_row(
                        finding,
                        description,
                        owner,
                        due,
                        ActionStatus.COMPLETED,
                        completion,
                    )
                )
                return rows
            action_status = _weighted_choice(
                self._rng,
                [ActionStatus.IN_PROGRESS, ActionStatus.NOT_STARTED],
                [0.6, 0.4],
            )
        else:
            action_status = _weighted_choice(
                self._rng,
                [ActionStatus.NOT_STARTED, ActionStatus.IN_PROGRESS],
                [0.55, 0.45],
            )

        rows.append(
            self._action_row(finding, description, owner, due, action_status, None)
        )

        if severity is FindingSeverity.CRITICAL and self._rng.random() < 0.35:
            interim_due = identified + timedelta(days=14)
            if self.reference_date >= identified + timedelta(days=20):
                interim_status = ActionStatus.COMPLETED
                interim_completion: date | None = min(
                    identified + timedelta(days=int(self._rng.integers(10, 20))),
                    self.reference_date,
                )
            else:
                interim_status = ActionStatus.IN_PROGRESS
                interim_completion = None
            rows.append(
                self._action_row(
                    finding,
                    (
                        f"Interim mitigation: restrict access in {area} until the "
                        "permanent fix is delivered."
                    ),
                    owner,
                    interim_due,
                    interim_status,
                    interim_completion,
                )
            )

        return rows

    @staticmethod
    def _action_row(
        finding: dict[str, object],
        description: str,
        owner: str,
        due: date,
        status: ActionStatus,
        completion: date | None,
    ) -> dict[str, object]:
        return {
            "finding_ref": finding["finding_ref"],
            "action_description": description,
            "assigned_owner": owner,
            "due_date": due,
            "status": status,
            "completion_date": completion,
        }

    # ------------------------------------------------------------------
    # Frame helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _to_frame(
        rows: list[dict[str, object]],
        columns: list[str],
        date_columns: list[str],
    ) -> pd.DataFrame:
        frame = pd.DataFrame(rows, columns=columns)
        for column in date_columns:
            frame[column] = pd.to_datetime(frame[column])
        return frame
