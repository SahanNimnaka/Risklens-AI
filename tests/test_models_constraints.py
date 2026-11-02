"""Schema, constraint and relationship tests.

These tests run against the real PostgreSQL schema created by Alembic. They
prove the properties the loader and Phase 2 rules depend on: enums are real
CHECK-constrained VARCHAR columns, natural keys are unique, dates are ordered,
completed actions carry a completion date, and foreign keys cascade correctly.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import ActionPlan, Audit, Control, Finding
from app.models.enums import ActionStatus
from tests.support import make_action, make_audit, make_control, make_finding


def _seed_chain(db_session):
    audit = make_audit()
    db_session.add(audit)
    db_session.flush()

    control = make_control()
    db_session.add(control)
    db_session.flush()

    finding = make_finding(audit_id=audit.id, control_id=control.id)
    db_session.add(finding)
    db_session.flush()

    return audit, control, finding


def test_enums_are_varchar_with_check_constraints(db_session):
    rows = db_session.execute(
        text(
            "SELECT table_name, column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND column_name IN ('department', 'status', 'severity')"
        )
    ).all()

    assert rows
    for table_name, column_name, data_type in rows:
        assert data_type == "character varying", (table_name, column_name, data_type)

    counts = dict(
        db_session.execute(
            text(
                "SELECT conrelid::regclass::text AS table_name, count(*) "
                "FROM pg_constraint "
                "WHERE contype = 'c' AND connamespace = 'public'::regnamespace "
                "GROUP BY 1"
            )
        ).all()
    )
    assert counts == {
        "audits": 4,
        "controls": 5,
        "findings": 3,
        "action_plans": 2,
    }


def test_key_indexes_exist(db_session):
    names = {
        row[0]
        for row in db_session.execute(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
        ).all()
    }
    assert {
        "ix_audits_department_start_date",
        "ix_controls_department_category",
        "ix_findings_audit_identified_date",
        "ix_findings_severity_status",
        "ix_findings_root_cause_identified_date",
        "ix_findings_control_id",
        "ix_action_plans_status_due_date",
        "ix_action_plans_finding_id",
    } <= names


def test_audit_end_before_start_is_rejected(db_session):
    db_session.add(
        make_audit(start_date=date(2026, 3, 1), end_date=date(2026, 2, 1))
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_duplicate_audit_ref_is_rejected(db_session):
    db_session.add(make_audit())
    db_session.flush()

    db_session.add(make_audit(title="Another audit"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_invalid_department_enum_is_rejected(db_session):
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO audits "
                "(audit_ref, title, department, audit_type, lead_auditor, "
                " start_date, end_date, status) "
                "VALUES ('AUD-BAD-1', 'Bad', 'nonsense', 'financial', "
                "'T. Tester', '2026-01-01', NULL, 'planned')"
            )
        )
    db_session.rollback()


def test_invalid_control_effectiveness_enum_is_rejected(db_session):
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO controls "
                "(control_ref, name, department, category, owner, frequency, "
                " status, effectiveness) "
                "VALUES ('CTL-BAD-1', 'Bad', 'finance', 'reconciliation', "
                "'T. Tester', 'monthly', 'active', 'excellent')"
            )
        )
    db_session.rollback()


def test_completed_action_requires_completion_date(db_session):
    audit, _, finding = _seed_chain(db_session)

    db_session.add(
        make_action(
            finding_id=finding.id,
            status=ActionStatus.COMPLETED,
            completion_date=None,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
    assert audit.id is not None


def test_finding_requires_an_existing_audit(db_session):
    db_session.add(make_finding(audit_id=999_999_999))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_deleting_an_audit_cascades_to_findings_and_actions(db_session):
    audit, _, finding = _seed_chain(db_session)
    db_session.add(make_action(finding_id=finding.id))
    db_session.flush()

    db_session.execute(
        text("DELETE FROM audits WHERE id = :id"), {"id": audit.id}
    )
    db_session.expunge_all()

    assert db_session.scalar(select(func.count()).select_from(Finding)) == 0
    assert db_session.scalar(select(func.count()).select_from(ActionPlan)) == 0


def test_deleting_a_control_detaches_findings(db_session):
    _, control, finding = _seed_chain(db_session)
    finding_id = finding.id

    db_session.execute(
        text("DELETE FROM controls WHERE id = :id"), {"id": control.id}
    )
    db_session.expunge_all()

    stored = db_session.scalar(select(Finding).where(Finding.id == finding_id))
    assert stored is not None
    assert stored.control_id is None


def test_completed_action_accepts_a_completion_date(db_session):
    _, _, finding = _seed_chain(db_session)
    db_session.add(
        make_action(
            finding_id=finding.id,
            status=ActionStatus.COMPLETED,
            completion_date=date(2026, 2, 20),
        )
    )
    db_session.flush()

    assert db_session.scalar(select(func.count()).select_from(ActionPlan)) == 1
