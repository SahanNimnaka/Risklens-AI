"""Validated, idempotent loader for the synthetic audit dataset.

The loader is deliberately boring: it maps natural keys to database ids and
writes one transaction. It does not compute risk, and it does not invent rows.

Idempotency rules
-----------------

* ``audits``, ``controls`` and ``findings`` are matched on their natural keys
  (``audit_ref``, ``control_ref``, ``finding_ref``). A rerun with unchanged data
  performs no writes at all.
* ``action_plans`` have no natural key in the schema, so they are matched on
  ``(finding_id, action_description, due_date)``. The loader owns the action
  plans of the synthetic findings it loads: an action that no longer exists in
  the generated dataset is removed. Actions belonging to findings outside the
  synthetic ``FND-`` range are never touched.
* ``--reset-synthetic`` deletes only rows whose natural keys use the synthetic
  prefixes (``AUD-``, ``CTL-``, ``FND-``) before reloading. Hand-written rows
  are left alone.

Validation runs before any write, so a broken dataset cannot partially load.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Mapping

import pandas as pd
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ActionPlan, Audit, Control, Finding
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
from app.modules.synthetic_data.validation import DatasetReport, validate_dataset

SYNTHETIC_REF_PREFIXES = {
    "audits": "AUD-",
    "controls": "CTL-",
    "findings": "FND-",
}


@dataclass
class TableStats:
    """What happened to one table during a load."""

    created: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0

    @property
    def written(self) -> int:
        return self.created + self.updated

    def as_dict(self) -> dict[str, int]:
        return {
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "removed": self.removed,
        }


@dataclass
class LoaderReport:
    """Result of one load, suitable for a CLI summary or JSON output."""

    reset: bool
    audits: TableStats = field(default_factory=TableStats)
    controls: TableStats = field(default_factory=TableStats)
    findings: TableStats = field(default_factory=TableStats)
    action_plans: TableStats = field(default_factory=TableStats)
    reset_removed: dict[str, int] = field(default_factory=dict)

    @property
    def total_created(self) -> int:
        return (
            self.audits.created
            + self.controls.created
            + self.findings.created
            + self.action_plans.created
        )

    @property
    def total_updated(self) -> int:
        return (
            self.audits.updated
            + self.controls.updated
            + self.findings.updated
            + self.action_plans.updated
        )

    @property
    def total_unchanged(self) -> int:
        return (
            self.audits.unchanged
            + self.controls.unchanged
            + self.findings.unchanged
            + self.action_plans.unchanged
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "reset": self.reset,
            "reset_removed": self.reset_removed,
            "totals": {
                "created": self.total_created,
                "updated": self.total_updated,
                "unchanged": self.total_unchanged,
            },
            "tables": {
                "audits": self.audits.as_dict(),
                "controls": self.controls.as_dict(),
                "findings": self.findings.as_dict(),
                "action_plans": self.action_plans.as_dict(),
            },
        }


# ----------------------------------------------------------------------
# Public entry points
# ----------------------------------------------------------------------
def load_dataset(
    session: Session,
    bundle: DatasetBundle,
    *,
    reset: bool = False,
    report: DatasetReport | None = None,
) -> LoaderReport:
    """Validate and load the bundle in a single transaction.

    ``report`` may be passed when the caller has already validated the bundle;
    otherwise validation runs again here. Any failure rolls the whole load back,
    including a preceding reset.
    """
    if report is None:
        validate_dataset(bundle)

    load_report = LoaderReport(reset=reset)

    try:
        if reset:
            load_report.reset_removed = reset_synthetic_data(session)

        _load_controls(session, bundle, load_report)
        _load_audits(session, bundle, load_report)
        # Findings need the ids generated for the rows above.
        session.flush()

        audit_ids, control_ids = _reference_maps(session)
        finding_ids = _load_findings(session, bundle, audit_ids, control_ids, load_report)
        session.flush()

        _load_action_plans(session, bundle, finding_ids, load_report)
        session.commit()
    except Exception:
        session.rollback()
        raise

    return load_report


def reset_synthetic_data(session: Session) -> dict[str, int]:
    """Delete synthetic rows only, leaving manually created records intact.

    The delete order follows the foreign keys: action plans, findings, controls,
    audits. Callers are responsible for committing (or rolling back) the
    surrounding transaction.
    """
    finding_ids = select(Finding.id).where(
        Finding.finding_ref.like(f"{SYNTHETIC_REF_PREFIXES['findings']}%")
    )

    removed = {
        "action_plans": _rowcount(
            session.execute(
                delete(ActionPlan).where(ActionPlan.finding_id.in_(finding_ids)),
                execution_options={"synchronize_session": False},
            )
        ),
        "findings": _rowcount(
            session.execute(
                delete(Finding).where(
                    Finding.finding_ref.like(
                        f"{SYNTHETIC_REF_PREFIXES['findings']}%"
                    )
                ),
                execution_options={"synchronize_session": False},
            )
        ),
        "controls": _rowcount(
            session.execute(
                delete(Control).where(
                    Control.control_ref.like(
                        f"{SYNTHETIC_REF_PREFIXES['controls']}%"
                    )
                ),
                execution_options={"synchronize_session": False},
            )
        ),
        "audits": _rowcount(
            session.execute(
                delete(Audit).where(
                    Audit.audit_ref.like(f"{SYNTHETIC_REF_PREFIXES['audits']}%")
                ),
                execution_options={"synchronize_session": False},
            )
        ),
    }

    # Objects deleted through Core statements are still in the identity map.
    # Dropping them guarantees the following SELECTs see the real table state.
    session.expunge_all()
    return removed


def format_loader_report(report: LoaderReport) -> str:
    lines: list[str] = []
    if report.reset:
        removed = ", ".join(
            f"{table}={count}" for table, count in report.reset_removed.items()
        )
        lines.append(f"reset removed: {removed or 'nothing'}")

    lines.append(
        f"load totals: created={report.total_created} "
        f"updated={report.total_updated} unchanged={report.total_unchanged}"
    )
    for name in ("audits", "controls", "findings", "action_plans"):
        stats: TableStats = getattr(report, name)
        lines.append(
            f"  {name:<13} created={stats.created:<4} updated={stats.updated:<4} "
            f"unchanged={stats.unchanged:<4} removed={stats.removed}"
        )
    return "\n".join(lines)


# ----------------------------------------------------------------------
# Per-table loaders
# ----------------------------------------------------------------------
def _load_controls(
    session: Session, bundle: DatasetBundle, report: LoaderReport
) -> None:
    for row in _records(bundle.controls):
        values = {
            "name": _required_text(row, "name"),
            "description": _text(row.get("description")),
            "department": _enum(Department, row["department"], "department"),
            "category": _enum(ControlCategory, row["category"], "category"),
            "owner": _required_text(row, "owner"),
            "frequency": _enum(ControlFrequency, row["frequency"], "frequency"),
            "status": _enum(ControlStatus, row["status"], "status"),
            "effectiveness": _enum(
                ControlEffectiveness, row["effectiveness"], "effectiveness"
            ),
            "last_tested_date": _date_value(row.get("last_tested_date")),
        }
        _upsert(
            session,
            Control,
            {"control_ref": _required_text(row, "control_ref")},
            values,
            report.controls,
        )


def _load_audits(session: Session, bundle: DatasetBundle, report: LoaderReport) -> None:
    for row in _records(bundle.audits):
        values = {
            "title": _required_text(row, "title"),
            "department": _enum(Department, row["department"], "department"),
            "audit_type": _enum(AuditType, row["audit_type"], "audit_type"),
            "lead_auditor": _required_text(row, "lead_auditor"),
            "start_date": _required_date(row, "start_date"),
            "end_date": _date_value(row.get("end_date")),
            "status": _enum(AuditStatus, row["status"], "status"),
        }
        _upsert(
            session,
            Audit,
            {"audit_ref": _required_text(row, "audit_ref")},
            values,
            report.audits,
        )


def _load_findings(
    session: Session,
    bundle: DatasetBundle,
    audit_ids: Mapping[str, int],
    control_ids: Mapping[str, int],
    report: LoaderReport,
) -> dict[str, int]:
    loaded_refs: list[str] = []

    for row in _records(bundle.findings):
        finding_ref = _required_text(row, "finding_ref")
        audit_ref = _required_text(row, "audit_ref")
        control_ref = _text(row.get("control_ref"))

        if audit_ref not in audit_ids:
            raise ValueError(
                f"finding {finding_ref} references unknown audit {audit_ref!r}"
            )
        if control_ref is not None and control_ref not in control_ids:
            raise ValueError(
                f"finding {finding_ref} references unknown control {control_ref!r}"
            )

        values = {
            "audit_id": audit_ids[audit_ref],
            "control_id": control_ids[control_ref] if control_ref else None,
            "title": _required_text(row, "title"),
            "description": _text(row.get("description")),
            "severity": _enum(FindingSeverity, row["severity"], "severity"),
            "status": _enum(FindingStatus, row["status"], "status"),
            "root_cause_category": _enum(
                RootCauseCategory, row["root_cause_category"], "root_cause_category"
            ),
            "evidence_reference": _text(row.get("evidence_reference")),
            "identified_date": _required_date(row, "identified_date"),
        }
        _upsert(
            session,
            Finding,
            {"finding_ref": finding_ref},
            values,
            report.findings,
        )
        loaded_refs.append(finding_ref)

    # Identity values only exist after the INSERT is flushed.
    session.flush()
    if not loaded_refs:
        return {}

    return dict(
        session.execute(
            select(Finding.finding_ref, Finding.id).where(
                Finding.finding_ref.in_(loaded_refs)
            )
        ).all()
    )


def _load_action_plans(
    session: Session,
    bundle: DatasetBundle,
    finding_ids: Mapping[str, int],
    report: LoaderReport,
) -> None:
    desired: dict[int, list[dict[str, Any]]] = {}
    for row in _records(bundle.action_plans):
        finding_ref = _required_text(row, "finding_ref")
        if finding_ref not in finding_ids:
            raise ValueError(
                f"action plan references unknown finding {finding_ref!r}"
            )
        finding_id = finding_ids[finding_ref]
        desired.setdefault(finding_id, []).append(
            {
                "action_description": _required_text(row, "action_description"),
                "assigned_owner": _required_text(row, "assigned_owner"),
                "due_date": _required_date(row, "due_date"),
                "status": _enum(ActionStatus, row["status"], "status"),
                "completion_date": _date_value(row.get("completion_date")),
            }
        )

    if not finding_ids:
        return

    existing_rows = session.scalars(
        select(ActionPlan).where(ActionPlan.finding_id.in_(finding_ids.values()))
    ).all()
    existing: dict[int, list[ActionPlan]] = {}
    for action in existing_rows:
        existing.setdefault(action.finding_id, []).append(action)

    for finding_id in finding_ids.values():
        wanted = desired.get(finding_id, [])
        current = existing.get(finding_id, [])
        matched: set[int] = set()

        for values in wanted:
            key = (values["action_description"], values["due_date"])
            match = next(
                (
                    action
                    for action in current
                    if action.id not in matched
                    and (action.action_description, action.due_date) == key
                ),
                None,
            )
            if match is None:
                session.add(ActionPlan(finding_id=finding_id, **values))
                report.action_plans.created += 1
                continue

            matched.add(match.id)
            _apply_values(match, values, report.action_plans)

        for action in current:
            if action.id not in matched:
                session.delete(action)
                report.action_plans.removed += 1


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _upsert(
    session: Session,
    model: type,
    natural_key: dict[str, Any],
    values: dict[str, Any],
    stats: TableStats,
):
    existing = session.scalar(select(model).filter_by(**natural_key))
    if existing is None:
        instance = model(**natural_key, **values)
        session.add(instance)
        stats.created += 1
        return instance

    _apply_values(existing, values, stats)
    return existing


def _apply_values(instance, values: dict[str, Any], stats: TableStats) -> None:
    changed = False
    for field_name, new_value in values.items():
        if getattr(instance, field_name) != new_value:
            setattr(instance, field_name, new_value)
            changed = True
    if changed:
        stats.updated += 1
    else:
        stats.unchanged += 1


def _reference_maps(session: Session) -> tuple[dict[str, int], dict[str, int]]:
    audit_ids = dict(
        session.execute(select(Audit.audit_ref, Audit.id)).all()
    )
    control_ids = dict(
        session.execute(select(Control.control_ref, Control.id)).all()
    )
    return audit_ids, control_ids


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert a frame to plain Python scalars, one dict per row."""
    return frame.to_dict(orient="records")


def _rowcount(result) -> int:
    return int(result.rowcount or 0)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if value is pd.NaT:
        return None
    text = str(value)
    return None if text == "" else text


def _required_text(row: Mapping[str, Any], column: str) -> str:
    value = _text(row.get(column))
    if value is None:
        raise ValueError(f"column {column!r} is required but is null")
    return value


def _date_value(value: Any) -> date | None:
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise ValueError(f"cannot convert {value!r} to a date")


def _required_date(row: Mapping[str, Any], column: str) -> date:
    value = _date_value(row.get(column))
    if value is None:
        raise ValueError(f"column {column!r} is required but is null")
    return value


def _enum(enum_cls, value: Any, column: str):
    if isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(str(value))
    except ValueError as error:
        raise ValueError(
            f"column {column!r} has invalid value {value!r}"
        ) from error
