"""Determinism, integrity and business-coverage tests for the generator.

The exact counts are intentional: they document the dataset Phase 2 is built
against. Changing the generator should update these numbers deliberately, not
silently.
"""

from __future__ import annotations

from dataclasses import replace

import pandas as pd
import pytest

from app.modules.synthetic_data.generator import DatasetBundle, SyntheticDatasetGenerator
from app.modules.synthetic_data.validation import (
    DatasetValidationError,
    validate_dataset,
)


@pytest.fixture(scope="module")
def bundle() -> DatasetBundle:
    return SyntheticDatasetGenerator(seed=42).generate()


@pytest.fixture(scope="module")
def report(bundle):
    return validate_dataset(bundle)


def _with_frame(bundle: DatasetBundle, name: str, frame: pd.DataFrame) -> DatasetBundle:
    return replace(bundle, **{name: frame})


def test_same_seed_produces_identical_frames():
    first = SyntheticDatasetGenerator(seed=42).generate()
    second = SyntheticDatasetGenerator(seed=42).generate()

    for frame_name in ("audits", "controls", "findings", "action_plans"):
        pd.testing.assert_frame_equal(
            getattr(first, frame_name), getattr(second, frame_name)
        )


def test_different_seed_produces_different_data():
    first = SyntheticDatasetGenerator(seed=42).generate()
    second = SyntheticDatasetGenerator(seed=7).generate()

    assert not first.findings.equals(second.findings)


def test_dataset_counts_match_the_documented_shape(report):
    assert report.counts == {
        "audits": 60,
        "controls": 30,
        "findings": 197,
        "action_plans": 165,
    }


def test_severity_and_status_counts_are_consistent(bundle, report):
    assert sum(report.severity_counts.values()) == len(bundle.findings)
    assert sum(report.finding_status_counts.values()) == len(bundle.findings)
    assert sum(report.action_status_counts.values()) == len(bundle.action_plans)
    assert report.critical_unresolved == 13


def test_every_department_is_represented(bundle, report):
    audit_departments = set(bundle.audits["department"])
    finding_departments = set(
        bundle.findings.merge(
            bundle.audits[["audit_ref", "department"]], on="audit_ref"
        )["department"]
    )

    assert len(audit_departments) == 6
    assert finding_departments == audit_departments
    assert report.weak_control_findings > report.ineffective_control_findings > 0


def test_business_coverage_has_rule_signal(report):
    assert report.overdue_actions >= 30
    assert report.blocked_actions >= 5
    assert report.completed_actions >= 100
    assert report.critical_unresolved >= 10
    assert report.multi_finding_audits >= 40
    assert len(report.recurrence_clusters) >= 10

    for cluster in report.recurrence_clusters:
        assert cluster["count"] >= 3
        assert cluster["window_start"] <= cluster["window_end"]


def test_findings_fall_inside_their_audit_window(bundle):
    merged = bundle.findings.merge(
        bundle.audits[["audit_ref", "start_date", "end_date"]],
        on="audit_ref",
        validate="many_to_one",
    )

    assert (merged["identified_date"] >= merged["start_date"]).all()
    assert (
        merged["end_date"].isna()
        | (merged["identified_date"] <= merged["end_date"])
    ).all()


def test_resolved_findings_have_a_completed_action(bundle):
    resolved = set(
        bundle.findings.loc[bundle.findings["status"] == "resolved", "finding_ref"]
    )
    completed = set(
        bundle.action_plans.loc[
            bundle.action_plans["status"] == "completed", "finding_ref"
        ]
    )

    assert resolved
    assert resolved <= completed


def test_validation_rejects_duplicate_natural_keys(bundle):
    audits = pd.concat([bundle.audits, bundle.audits.iloc[[0]]], ignore_index=True)

    with pytest.raises(DatasetValidationError) as error:
        validate_dataset(_with_frame(bundle, "audits", audits))

    assert "duplicate audit_ref" in str(error.value)


def test_validation_rejects_orphan_action_plans(bundle):
    actions = bundle.action_plans.copy()
    actions.loc[actions.index[0], "finding_ref"] = "FND-9999-9999"

    with pytest.raises(DatasetValidationError) as error:
        validate_dataset(_with_frame(bundle, "action_plans", actions))

    assert "unknown findings" in str(error.value)


def test_validation_rejects_findings_before_the_audit_start(bundle):
    findings = bundle.findings.copy()
    row = findings.index[0]
    audit_ref = findings.loc[row, "audit_ref"]
    start = bundle.audits.loc[
        bundle.audits["audit_ref"] == audit_ref, "start_date"
    ].iloc[0]
    findings.loc[row, "identified_date"] = start - pd.Timedelta(days=1)

    with pytest.raises(DatasetValidationError) as error:
        validate_dataset(_with_frame(bundle, "findings", findings))

    assert "before their audit started" in str(error.value)


def test_validation_rejects_resolved_findings_without_completed_action(bundle):
    resolved_ref = bundle.findings.loc[
        bundle.findings["status"] == "resolved", "finding_ref"
    ].iloc[0]
    actions = bundle.action_plans[
        bundle.action_plans["finding_ref"] != resolved_ref
    ].copy()

    with pytest.raises(DatasetValidationError) as error:
        validate_dataset(_with_frame(bundle, "action_plans", actions))

    assert "resolved finding(s) have no completed action" in str(error.value)
