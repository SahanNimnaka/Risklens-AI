"""Tests for supplementary anomaly detection.

The tests cover three layers:

* feature semantics, including the ``as_of`` filters and neutral imputation;
* peer-relative normalization and its department/global fallbacks;
* detector determinism, output ordering and separation from the risk score.

The full-dataset test pins deterministic counts as regression facts only. It is
not an accuracy measurement: there are no ground-truth anomaly labels.
"""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import pytest

from app.core.config import settings
from app.models.enums import (
    ActionStatus,
    ControlEffectiveness,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.anomaly_detection import (
    FEATURE_NAMES,
    build_feature_frame,
    detect_anomalies,
    normalize_features,
)
from app.modules.risk_monitoring import compute_risk
from app.modules.synthetic_data.generator import SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import load_dataset
from app.modules.synthetic_data.validation import validate_dataset
from tests.support import make_action, make_audit, make_control, make_finding

AS_OF = date(2026, 10, 31)
DAY = timedelta(days=1)


# ---------------------------------------------------------------------------
# Seeding helpers
# ---------------------------------------------------------------------------
def _seed_audit(
    session,
    *,
    audit_ref: str,
    department: Department = Department.FINANCE,
    start_date: date = AS_OF - 200 * DAY,
    end_date: date | None = AS_OF - DAY,
):
    audit = make_audit(
        audit_ref=audit_ref,
        department=department,
        start_date=start_date,
        end_date=end_date,
    )
    session.add(audit)
    session.flush()
    return audit


def _seed_finding(
    session,
    *,
    audit,
    finding_ref: str,
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    status: FindingStatus = FindingStatus.OPEN,
    identified_date: date = AS_OF - 10 * DAY,
    root_cause: RootCauseCategory = RootCauseCategory.PROCESS_GAP,
    control_id: int | None = None,
):
    finding = make_finding(
        finding_ref=finding_ref,
        audit_id=audit.id,
        severity=severity,
        status=status,
        root_cause_category=root_cause,
        identified_date=identified_date,
        control_id=control_id,
    )
    session.add(finding)
    session.flush()
    return finding


def _seed_action(
    session,
    *,
    finding,
    due_date: date,
    status: ActionStatus = ActionStatus.NOT_STARTED,
    completion_date: date | None = None,
):
    action = make_action(
        finding_id=finding.id,
        due_date=due_date,
        status=status,
        completion_date=completion_date,
    )
    session.add(action)
    session.flush()
    return action


# ---------------------------------------------------------------------------
# Feature semantics
# ---------------------------------------------------------------------------
def test_feature_frame_excludes_clean_future_and_post_as_of_rows(db_session):
    audit = _seed_audit(db_session, audit_ref="AUD-ELIGIBLE")
    _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-ELIGIBLE",
        identified_date=AS_OF - 10 * DAY,
    )
    # A finding identified after as_of is not part of the snapshot.
    _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FUTURE",
        identified_date=AS_OF + 5 * DAY,
    )
    # An audit with no findings is out of scope, even if it started in time.
    _seed_audit(db_session, audit_ref="AUD-CLEAN")
    # An audit that starts after as_of is out of scope.
    future_audit = _seed_audit(
        db_session,
        audit_ref="AUD-FUTURE",
        start_date=AS_OF + 10 * DAY,
        end_date=None,
    )
    _seed_finding(
        db_session,
        audit=future_audit,
        finding_ref="FND-FUTURE-AUDIT",
        identified_date=AS_OF - 10 * DAY,
    )

    frame = build_feature_frame(db_session, AS_OF)

    assert list(frame.columns) == ["audit_ref", "department", "audit_title", *FEATURE_NAMES]
    assert list(frame["audit_ref"]) == ["AUD-ELIGIBLE"]
    assert frame.iloc[0]["finding_count"] == 1


def test_feature_values_match_the_documented_definitions(db_session):
    audit = _seed_audit(db_session, audit_ref="AUD-FEATURES")
    weak_control = make_control(
        control_ref="CTL-FEATURES-WEAK",
        department=Department.FINANCE,
        status=ControlStatus.ACTIVE,
        effectiveness=ControlEffectiveness.INEFFECTIVE,
    )
    db_session.add(weak_control)
    db_session.flush()

    critical = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FEATURES-CRITICAL",
        severity=FindingSeverity.CRITICAL,
        status=FindingStatus.OPEN,
        identified_date=AS_OF - 50 * DAY,
        root_cause=RootCauseCategory.PROCESS_GAP,
        control_id=weak_control.id,
    )
    high = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FEATURES-HIGH",
        severity=FindingSeverity.HIGH,
        status=FindingStatus.RESOLVED,
        identified_date=AS_OF - 40 * DAY,
        root_cause=RootCauseCategory.DATA_QUALITY,
    )
    accepted = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FEATURES-ACCEPTED",
        severity=FindingSeverity.MEDIUM,
        status=FindingStatus.ACCEPTED,
        identified_date=AS_OF - 30 * DAY,
        root_cause=RootCauseCategory.PROCESS_GAP,
    )
    low = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FEATURES-LOW",
        severity=FindingSeverity.LOW,
        status=FindingStatus.IN_PROGRESS,
        identified_date=AS_OF - 20 * DAY,
        root_cause=RootCauseCategory.PROCESS_GAP,
        control_id=weak_control.id,
    )

    # Two overdue actions on the critical finding, one of them blocked.
    _seed_action(db_session, finding=critical, due_date=AS_OF - 10 * DAY)
    _seed_action(
        db_session,
        finding=critical,
        due_date=AS_OF - 5 * DAY,
        status=ActionStatus.BLOCKED,
    )
    # Completed before as_of, so not overdue.
    _seed_action(
        db_session,
        finding=high,
        due_date=AS_OF + 10 * DAY,
        status=ActionStatus.COMPLETED,
        completion_date=AS_OF - 5 * DAY,
    )
    # Accepted findings are excluded from the unactioned share.
    _seed_action(db_session, finding=accepted, due_date=AS_OF + 20 * DAY)
    # The low finding deliberately has no action plan.

    frame = build_feature_frame(db_session, AS_OF)

    assert len(frame) == 1
    row = frame.iloc[0]
    assert row["finding_count"] == 4
    assert row["critical_unresolved_count"] == 1
    assert row["high_critical_share"] == pytest.approx(0.5)
    assert row["overdue_action_rate"] == pytest.approx(0.5)
    assert row["mean_days_overdue"] == pytest.approx(7.5)
    assert row["blocked_action_count"] == 1
    assert row["weak_control_finding_share"] == pytest.approx(0.5)
    assert row["unactioned_finding_share"] == pytest.approx(1 / 3)
    assert row["resolved_share"] == pytest.approx(0.25)
    assert row["root_cause_diversity"] == pytest.approx(0.5)
    # Windows: 40, 45, 50 and 50 days.
    assert row["mean_remediation_window_days"] == pytest.approx(46.25)


def test_remediation_window_uses_department_median_when_actions_are_missing(
    db_session,
):
    for index, window in ((1, 10), (2, 20)):
        audit = _seed_audit(db_session, audit_ref=f"AUD-IMPUTE-{index}")
        finding = _seed_finding(
            db_session,
            audit=audit,
            finding_ref=f"FND-IMPUTE-{index}",
            identified_date=AS_OF - 30 * DAY,
        )
        _seed_action(
            db_session,
            finding=finding,
            due_date=finding.identified_date + window * DAY,
        )

    audit = _seed_audit(db_session, audit_ref="AUD-IMPUTE-3")
    _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-IMPUTE-3",
        identified_date=AS_OF - 30 * DAY,
    )

    frame = build_feature_frame(db_session, AS_OF).set_index("audit_ref")

    assert frame.loc["AUD-IMPUTE-1", "mean_remediation_window_days"] == pytest.approx(10)
    assert frame.loc["AUD-IMPUTE-2", "mean_remediation_window_days"] == pytest.approx(20)
    # Department median of 10 and 20.
    assert frame.loc["AUD-IMPUTE-3", "mean_remediation_window_days"] == pytest.approx(15)


def test_remediation_window_falls_back_to_global_median(db_session):
    for index in (1, 2):
        audit = _seed_audit(
            db_session,
            audit_ref=f"AUD-IMPUTE-IT-{index}",
            department=Department.IT,
        )
        _seed_finding(
            db_session,
            audit=audit,
            finding_ref=f"FND-IMPUTE-IT-{index}",
            identified_date=AS_OF - 30 * DAY,
        )

    finance_audit = _seed_audit(db_session, audit_ref="AUD-IMPUTE-FIN")
    finance_finding = _seed_finding(
        db_session,
        audit=finance_audit,
        finding_ref="FND-IMPUTE-FIN",
        identified_date=AS_OF - 30 * DAY,
    )
    _seed_action(
        db_session,
        finding=finance_finding,
        due_date=finance_finding.identified_date + 30 * DAY,
    )

    frame = build_feature_frame(db_session, AS_OF).set_index("audit_ref")

    assert frame.loc["AUD-IMPUTE-FIN", "mean_remediation_window_days"] == pytest.approx(30)
    # The IT department has no observed windows, so the global median applies.
    assert frame.loc["AUD-IMPUTE-IT-1", "mean_remediation_window_days"] == pytest.approx(30)
    assert frame.loc["AUD-IMPUTE-IT-2", "mean_remediation_window_days"] == pytest.approx(30)


# ---------------------------------------------------------------------------
# Normalization fallbacks
# ---------------------------------------------------------------------------
def _normalization_frame(departments: list[str], values: list[float]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "department": departments,
            "finding_count": [float(value) for value in values],
        }
    )


def test_small_department_falls_back_to_global_statistics():
    # Finance has enough peers; IT has only two, so IT uses the global stats.
    frame = _normalization_frame(
        ["finance"] * 10 + ["it"] * 2,
        [float(value) for value in range(10)] + [100.0, 200.0],
    )

    result = normalize_features(
        frame,
        feature_names=("finding_count",),
        min_peer_audits=8,
    )

    global_median = 5.5
    global_mad = 3.0
    assert result.peer_medians.loc[10, "finding_count"] == pytest.approx(global_median)
    assert result.peer_medians.loc[11, "finding_count"] == pytest.approx(global_median)
    assert result.z_scores.loc[10, "finding_count"] == pytest.approx(
        0.6745 * (100.0 - global_median) / global_mad
    )
    assert result.z_scores.loc[11, "finding_count"] == pytest.approx(
        0.6745 * (200.0 - global_median) / global_mad
    )
    # Finance still uses its own median and MAD.
    assert result.peer_medians.loc[0, "finding_count"] == pytest.approx(4.5)
    assert result.z_scores.loc[0, "finding_count"] == pytest.approx(
        0.6745 * (0.0 - 4.5) / 2.5
    )


def test_zero_mad_department_falls_back_to_global_statistics():
    # Finance has eight rows but no within-department spread, so its MAD is
    # zero. The global distribution still has spread, so global stats apply.
    frame = _normalization_frame(
        ["finance"] * 8 + ["it"] * 8,
        [100.0] * 8 + [float(value) for value in range(8)],
    )

    result = normalize_features(
        frame,
        feature_names=("finding_count",),
        min_peer_audits=8,
    )

    assert result.peer_medians.loc[0, "finding_count"] == pytest.approx(53.5)
    assert result.z_scores.loc[0, "finding_count"] == pytest.approx(
        0.6745 * (100.0 - 53.5) / 46.5
    )
    # IT has eight peers and real spread, so it keeps its own statistics.
    assert result.peer_medians.loc[8, "finding_count"] == pytest.approx(3.5)
    assert result.z_scores.loc[8, "finding_count"] == pytest.approx(
        0.6745 * (0.0 - 3.5) / 2.0
    )


# ---------------------------------------------------------------------------
# Detector behaviour
# ---------------------------------------------------------------------------
def _toy_feature_frame() -> pd.DataFrame:
    records = []
    for index in range(24):
        records.append(
            {
                "audit_ref": f"AUD-TOY-{index:04d}",
                "department": "finance" if index % 2 == 0 else "it",
                "audit_title": f"Toy audit {index}",
                "finding_count": float(index % 5),
                "critical_unresolved_count": float(index % 3),
                "high_critical_share": (index % 4) / 4,
                "overdue_action_rate": (index % 2) * 0.5,
                "mean_days_overdue": float((index * 3) % 20),
                "blocked_action_count": float(index % 2),
                "weak_control_finding_share": (index % 3) / 3,
                "unactioned_finding_share": (index % 2) * 0.5,
                "resolved_share": (index % 3) / 3,
                "root_cause_diversity": (index % 4) / 4,
                "mean_remediation_window_days": float(index % 30),
            }
        )
    return pd.DataFrame(records)


def test_detector_output_is_ordered_explained_and_deterministic():
    frame = _toy_feature_frame()

    first = detect_anomalies(frame, as_of=AS_OF)
    second = detect_anomalies(frame.sample(frac=1, random_state=7), as_of=AS_OF)

    # Row order must not affect scores, flags or result order.
    assert first == second
    assert len(first.audits) == len(frame)
    assert len(first.flagged) == sum(audit.is_anomaly for audit in first.audits)

    keys = [(-audit.anomaly_score, audit.audit_ref) for audit in first.audits]
    assert keys == sorted(keys)
    assert first.audits[0].score_percentile == pytest.approx(100.0)
    assert all(0.0 < audit.score_percentile <= 100.0 for audit in first.audits)

    for audit in first.audits:
        assert tuple(audit.features) == FEATURE_NAMES
        assert len(audit.deviations) <= 3
        assert len(audit.all_deviations) == len(FEATURE_NAMES)
        assert {deviation.feature for deviation in audit.all_deviations} == set(
            FEATURE_NAMES
        )
        assert audit.all_deviations[: len(audit.deviations)] == audit.deviations
        magnitudes = [abs(deviation.robust_z) for deviation in audit.deviations]
        assert magnitudes == sorted(magnitudes, reverse=True)
        for deviation in audit.deviations:
            expected_direction = (
                "above_peer"
                if deviation.robust_z > 0
                else "below_peer"
                if deviation.robust_z < 0
                else "at_peer"
            )
            assert deviation.direction == expected_direction


def test_empty_feature_frame_returns_no_results(db_session):
    frame = build_feature_frame(db_session, AS_OF)

    result = detect_anomalies(frame, as_of=AS_OF)

    assert result.audits == ()
    assert result.flagged == ()
    assert result.feature_names == FEATURE_NAMES


def test_detector_rejects_a_frame_missing_feature_columns():
    frame = pd.DataFrame({"audit_ref": ["AUD-TOY"], "department": ["finance"]})

    with pytest.raises(ValueError, match="missing required column"):
        detect_anomalies(frame, as_of=AS_OF)


def test_detection_does_not_change_or_consume_risk_scores(db_session):
    audit = _seed_audit(db_session, audit_ref="AUD-ISOLATION")
    finding = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-ISOLATION",
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
    )
    _seed_action(
        db_session,
        finding=finding,
        due_date=AS_OF - 20 * DAY,
        status=ActionStatus.BLOCKED,
    )

    before = compute_risk(db_session, AS_OF)
    frame = build_feature_frame(db_session, AS_OF)
    result = detect_anomalies(frame, as_of=AS_OF)
    after = compute_risk(db_session, AS_OF)

    assert before == after
    assert "rule_points" not in frame.columns
    assert "band" not in frame.columns
    assert all(not hasattr(audit, "rule_points") for audit in result.audits)


# ---------------------------------------------------------------------------
# Full synthetic dataset
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def bundle():
    return SyntheticDatasetGenerator(seed=42).generate()


@pytest.fixture(scope="module")
def report(bundle):
    return validate_dataset(bundle)


def test_full_dataset_detection_is_deterministic(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)
    as_of = settings.synthetic_data_reference_date

    frame = build_feature_frame(db_session, as_of)
    first = detect_anomalies(frame, as_of=as_of)
    second = detect_anomalies(frame, as_of=as_of)

    assert first == second
    assert len(frame) == 56
    assert len(first.audits) == 56
    assert len(first.flagged) == 6
    assert len({audit.audit_ref for audit in first.audits}) == 56
    assert all(
        audit.anomaly_score >= 0.0
        for audit in first.audits
    )
