"""Factories for valid ORM instances used by the tests.

Each factory returns an unsaved instance. Callers add and flush it, or pass
invalid overrides to prove that a constraint rejects the row.
"""

from __future__ import annotations

from datetime import date, timedelta

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


def make_audit(**overrides) -> Audit:
    values = {
        "audit_ref": "AUD-TEST-0001",
        "title": "Test financial controls audit",
        "department": Department.FINANCE,
        "audit_type": AuditType.FINANCIAL,
        "lead_auditor": "T. Tester",
        "start_date": date(2026, 1, 5),
        "end_date": date(2026, 2, 5),
        "status": AuditStatus.COMPLETED,
    }
    values.update(overrides)
    return Audit(**values)


def make_control(**overrides) -> Control:
    values = {
        "control_ref": "CTL-TEST-0001",
        "name": "Month-end reconciliation",
        "description": "Balance sheet accounts are reconciled before close.",
        "department": Department.FINANCE,
        "category": ControlCategory.RECONCILIATION,
        "owner": "T. Tester",
        "frequency": ControlFrequency.MONTHLY,
        "status": ControlStatus.ACTIVE,
        "effectiveness": ControlEffectiveness.EFFECTIVE,
        "last_tested_date": date(2026, 3, 1),
    }
    values.update(overrides)
    return Control(**values)


def make_finding(**overrides) -> Finding:
    values = {
        "finding_ref": "FND-TEST-0001",
        "audit_id": 1,
        "control_id": None,
        "title": "Approval step missing",
        "description": "The approval step is not documented.",
        "severity": FindingSeverity.MEDIUM,
        "status": FindingStatus.OPEN,
        "root_cause_category": RootCauseCategory.PROCESS_GAP,
        "evidence_reference": "WP-TEST-01",
        "identified_date": date(2026, 1, 20),
    }
    values.update(overrides)
    return Finding(**values)


def make_action(**overrides) -> ActionPlan:
    values = {
        "finding_id": 1,
        "action_description": "Document the approval step.",
        "assigned_owner": "T. Tester",
        "due_date": date(2026, 3, 1),
        "status": ActionStatus.NOT_STARTED,
        "completion_date": None,
    }
    values.update(overrides)
    return ActionPlan(**values)
