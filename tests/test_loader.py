"""Loader tests: creation, idempotency, updates, reset scope and rollback."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import DataError

from app.models import ActionPlan, Audit, Control, Finding
from app.models.enums import ActionStatus
from app.modules.synthetic_data.generator import DatasetBundle, SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import load_dataset
from app.modules.synthetic_data.validation import (
    DatasetValidationError,
    validate_dataset,
)
from tests.support import make_audit


@pytest.fixture(scope="module")
def bundle() -> DatasetBundle:
    return SyntheticDatasetGenerator(seed=42).generate()


@pytest.fixture(scope="module")
def report(bundle):
    return validate_dataset(bundle)


def _counts(session) -> dict[str, int]:
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model))
        for model in (Audit, Control, Finding, ActionPlan)
    }


def test_first_load_creates_all_rows(db_session, bundle, report):
    result = load_dataset(db_session, bundle, report=report)

    assert result.total_created == 452
    assert result.total_updated == 0
    assert result.total_unchanged == 0
    assert _counts(db_session) == {
        "audits": 60,
        "controls": 30,
        "findings": 197,
        "action_plans": 165,
    }


def test_rerun_is_a_noop(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)

    second = load_dataset(db_session, bundle, report=report)

    assert second.total_created == 0
    assert second.total_updated == 0
    assert second.total_unchanged == 452
    assert second.action_plans.removed == 0


def test_changed_row_is_updated_and_restored(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)
    audit = db_session.scalar(
        select(Audit).where(Audit.audit_ref == "AUD-2024-0001")
    )
    original_title = audit.title
    audit.title = "Mutated title"
    db_session.flush()

    result = load_dataset(db_session, bundle, report=report)

    assert result.audits.updated == 1
    assert result.audits.unchanged == 59
    db_session.refresh(audit)
    assert audit.title == original_title


def test_stray_action_on_a_synthetic_finding_is_removed(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)
    finding = db_session.scalar(
        select(Finding).where(Finding.finding_ref == "FND-2024-0001")
    )
    db_session.add(
        ActionPlan(
            finding_id=finding.id,
            action_description="BOGUS stray action",
            assigned_owner="T. Tester",
            due_date=date(2026, 1, 1),
            status=ActionStatus.NOT_STARTED,
        )
    )
    db_session.flush()

    result = load_dataset(db_session, bundle, report=report)

    assert result.action_plans.removed == 1
    remaining = db_session.scalar(
        select(func.count())
        .select_from(ActionPlan)
        .where(ActionPlan.action_description == "BOGUS stray action")
    )
    assert remaining == 0


def test_reset_preserves_non_synthetic_rows(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)
    db_session.add(
        make_audit(
            audit_ref="MANUAL-0001",
            title="Hand-written audit",
            start_date=date(2026, 1, 3),
            end_date=date(2026, 2, 3),
        )
    )
    db_session.flush()

    result = load_dataset(db_session, bundle, report=report, reset=True)

    assert result.reset_removed == {
        "action_plans": 165,
        "findings": 197,
        "controls": 30,
        "audits": 60,
    }
    assert _counts(db_session) == {
        "audits": 61,
        "controls": 30,
        "findings": 197,
        "action_plans": 165,
    }
    manual = db_session.scalar(
        select(Audit).where(Audit.audit_ref == "MANUAL-0001")
    )
    assert manual is not None
    assert manual.title == "Hand-written audit"


def test_failed_load_rolls_back_the_transaction(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)

    actions = bundle.action_plans.copy()
    actions.loc[actions.index[0], "assigned_owner"] = "X" * 200  # VARCHAR(120)
    broken = replace(bundle, action_plans=actions)

    with pytest.raises(DataError):
        load_dataset(db_session, broken, report=report)

    assert _counts(db_session) == {
        "audits": 60,
        "controls": 30,
        "findings": 197,
        "action_plans": 165,
    }


def test_validation_blocks_writes_on_a_broken_dataset(db_session, bundle):
    actions = bundle.action_plans.copy()
    actions.loc[actions.index[0], "finding_ref"] = "FND-9999-9999"
    broken = replace(bundle, action_plans=actions)

    with pytest.raises(DatasetValidationError):
        load_dataset(db_session, broken)

    assert _counts(db_session) == {
        "audits": 0,
        "controls": 0,
        "findings": 0,
        "action_plans": 0,
    }
