"""Boundary and integration tests for the deterministic risk engine.

The boundary tests pin the exact edges of every threshold, so a refactor
cannot silently move a cut-off. The integration test loads the full synthetic
dataset and asserts the documented Phase 2 totals.
"""

from __future__ import annotations

from datetime import date, timedelta

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
from app.modules.risk_monitoring import compute_risk
from app.modules.risk_monitoring.rules import (
    RECURRENCE_MAX_POINTS,
    RULE_DEFINITIONS,
    band_for_score,
    overdue_multiplier,
    round_half_up,
)
from app.modules.synthetic_data.generator import SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import load_dataset
from app.modules.synthetic_data.validation import validate_dataset
from tests.support import make_action, make_audit, make_control, make_finding

AS_OF = date(2026, 10, 31)
DAY = timedelta(days=1)


def _hits_for(risk, rule_id: str):
    return [hit for hit in risk.hits if hit.rule_id == rule_id]


def _add_finding(
    db_session,
    *,
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    status: FindingStatus = FindingStatus.OPEN,
    identified_date: date = AS_OF - 10 * DAY,
    department: Department = Department.FINANCE,
    root_cause: RootCauseCategory = RootCauseCategory.PROCESS_GAP,
    audit_ref: str = "AUD-TEST-0001",
    finding_ref: str = "FND-TEST-0001",
):
    audit = make_audit(
        audit_ref=audit_ref,
        department=department,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    finding = make_finding(
        finding_ref=finding_ref,
        audit_id=audit.id,
        severity=severity,
        status=status,
        root_cause_category=root_cause,
        identified_date=identified_date,
    )
    db_session.add(finding)
    db_session.flush()
    return audit, finding


# ---------------------------------------------------------------------------
# Pure threshold helpers
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0, "low"),
        (74, "low"),
        (75, "medium"),
        (149, "medium"),
        (150, "high"),
        (299, "high"),
        (300, "critical"),
        (1444, "critical"),
    ],
)
def test_band_boundaries(score, expected):
    assert band_for_score(score) == expected


@pytest.mark.parametrize(
    ("days_overdue", "expected"),
    [
        (1, 1.0),
        (30, 1.0),
        (31, 1.5),
        (60, 1.5),
        (61, 2.0),
        (90, 2.0),
        (91, 2.5),
        (365, 2.5),
    ],
)
def test_overdue_multiplier_boundaries(days_overdue, expected):
    assert overdue_multiplier(days_overdue) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [(7.4, 7), (7.5, 8), (7.6, 8), (12.5, 13), (2.5, 3)],
)
def test_round_half_up(value, expected):
    assert round_half_up(value) == expected


def test_rule_catalog_keeps_the_approved_order():
    assert [definition.id for definition in RULE_DEFINITIONS] == [
        "R1_overdue_action",
        "R2_unresolved_critical",
        "R3_stale_finding",
        "R4_repeated_findings",
        "R5_blocked_action",
        "R6_weak_control",
    ]


# ---------------------------------------------------------------------------
# Rule 1 - overdue action plans
# ---------------------------------------------------------------------------
def test_rule1_aging_boundaries_use_half_up_rounding(db_session):
    _, finding = _add_finding(
        db_session,
        severity=FindingSeverity.MEDIUM,
        identified_date=AS_OF - 400 * DAY,
    )
    for days in (30, 31, 60, 61, 90, 91):
        db_session.add(
            make_action(
                finding_id=finding.id,
                action_description=f"Action due {days} days ago",
                due_date=AS_OF - days * DAY,
                status=ActionStatus.NOT_STARTED,
            )
        )
    db_session.flush()

    risk = compute_risk(db_session, AS_OF)
    hits = sorted(
        _hits_for(risk, "R1_overdue_action"),
        key=lambda hit: hit.evidence["days_overdue"],
    )

    assert [hit.evidence["days_overdue"] for hit in hits] == [30, 31, 60, 61, 90, 91]
    assert [hit.points for hit in hits] == [5, 8, 8, 10, 10, 13]


def test_rule1_due_today_is_not_overdue(db_session):
    _, finding = _add_finding(db_session)
    db_session.add(
        make_action(
            finding_id=finding.id,
            action_description="Due today",
            due_date=AS_OF,
        )
    )
    db_session.add(
        make_action(
            finding_id=finding.id,
            action_description="Due yesterday",
            due_date=AS_OF - DAY,
        )
    )
    db_session.flush()

    hits = _hits_for(compute_risk(db_session, AS_OF), "R1_overdue_action")

    assert len(hits) == 1
    assert hits[0].evidence["days_overdue"] == 1


def test_rule1_completed_actions_are_not_scored(db_session):
    _, finding = _add_finding(db_session)
    db_session.add(
        make_action(
            finding_id=finding.id,
            action_description="Completed before as-of",
            due_date=AS_OF - 20 * DAY,
            status=ActionStatus.COMPLETED,
            completion_date=AS_OF - 15 * DAY,
        )
    )
    db_session.flush()

    assert _hits_for(compute_risk(db_session, AS_OF), "R1_overdue_action") == []


def test_rule1_ignores_findings_identified_after_as_of(db_session):
    _, finding = _add_finding(db_session, identified_date=AS_OF + DAY)
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF - 20 * DAY,
        )
    )
    db_session.flush()

    risk = compute_risk(db_session, AS_OF)

    assert risk.hits == ()


# ---------------------------------------------------------------------------
# Rule 2 - unresolved critical findings
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("age_days", "expected"),
    [(0, 20), (30, 20), (31, 30), (90, 30), (91, 40)],
)
def test_rule2_age_bonus_boundaries(db_session, age_days, expected):
    _add_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - age_days * DAY,
    )

    hits = _hits_for(compute_risk(db_session, AS_OF), "R2_unresolved_critical")

    assert len(hits) == 1
    assert hits[0].points == expected


@pytest.mark.parametrize(
    ("status", "expected_hits"),
    [
        (FindingStatus.OPEN, 1),
        (FindingStatus.IN_PROGRESS, 1),
        (FindingStatus.RESOLVED, 0),
        (FindingStatus.ACCEPTED, 0),
    ],
)
def test_rule2_only_unresolved_criticals_are_scored(db_session, status, expected_hits):
    _add_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        status=status,
        identified_date=AS_OF - 100 * DAY,
    )

    hits = _hits_for(compute_risk(db_session, AS_OF), "R2_unresolved_critical")

    assert len(hits) == expected_hits


# ---------------------------------------------------------------------------
# Rule 3 - stale non-critical findings
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("severity", "age_days", "expected_points"),
    [
        (FindingSeverity.HIGH, 60, None),
        (FindingSeverity.HIGH, 61, 8),
        (FindingSeverity.MEDIUM, 90, None),
        (FindingSeverity.MEDIUM, 91, 4),
        (FindingSeverity.LOW, 120, None),
        (FindingSeverity.LOW, 121, 2),
    ],
)
def test_rule3_sla_boundaries_are_strict(
    db_session, severity, age_days, expected_points
):
    _add_finding(
        db_session,
        severity=severity,
        identified_date=AS_OF - age_days * DAY,
    )

    hits = _hits_for(compute_risk(db_session, AS_OF), "R3_stale_finding")

    if expected_points is None:
        assert hits == []
    else:
        assert len(hits) == 1
        assert hits[0].points == expected_points


def test_rule3_excludes_critical_findings(db_session):
    _add_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 400 * DAY,
    )

    risk = compute_risk(db_session, AS_OF)

    assert _hits_for(risk, "R3_stale_finding") == []
    assert len(_hits_for(risk, "R2_unresolved_critical")) == 1


@pytest.mark.parametrize(
    ("status", "expected_hits"),
    [
        (FindingStatus.OPEN, 1),
        (FindingStatus.IN_PROGRESS, 1),
        (FindingStatus.RESOLVED, 0),
        (FindingStatus.ACCEPTED, 0),
    ],
)
def test_rule3_only_unresolved_findings_are_scored(db_session, status, expected_hits):
    _add_finding(
        db_session,
        severity=FindingSeverity.HIGH,
        status=status,
        identified_date=AS_OF - 100 * DAY,
    )

    hits = _hits_for(compute_risk(db_session, AS_OF), "R3_stale_finding")

    assert len(hits) == expected_hits


# ---------------------------------------------------------------------------
# Rule 4 - repeated findings
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("count", "expected_points"),
    [(2, None), (3, 5), (6, 20), (7, 25), (8, 25)],
)
def test_rule4_cluster_threshold_and_cap(db_session, count, expected_points):
    audit = make_audit(
        audit_ref="AUD-CLUSTER-0001",
        department=Department.OPERATIONS,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    for index in range(count):
        db_session.add(
            make_finding(
                finding_ref=f"FND-CLUSTER-{index:04d}",
                audit_id=audit.id,
                severity=FindingSeverity.LOW,
                root_cause_category=RootCauseCategory.PROCESS_GAP,
                identified_date=AS_OF - 10 * DAY,
            )
        )
    db_session.flush()

    hits = _hits_for(compute_risk(db_session, AS_OF), "R4_repeated_findings")

    if expected_points is None:
        assert hits == []
    else:
        assert len(hits) == 1
        assert hits[0].points == expected_points
        assert hits[0].points <= RECURRENCE_MAX_POINTS
        assert hits[0].department is Department.OPERATIONS
        assert hits[0].evidence["count"] == count


def test_rule4_window_start_is_inclusive(db_session):
    audit = make_audit(
        audit_ref="AUD-WINDOW-0001",
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    for index in range(3):
        db_session.add(
            make_finding(
                finding_ref=f"FND-WINDOW-{index:04d}",
                audit_id=audit.id,
                root_cause_category=RootCauseCategory.DATA_QUALITY,
                identified_date=AS_OF - 179 * DAY,
            )
        )
    db_session.flush()

    assert len(_hits_for(compute_risk(db_session, AS_OF), "R4_repeated_findings")) == 1


def test_rule4_findings_before_the_window_are_ignored(db_session):
    audit = make_audit(
        audit_ref="AUD-WINDOW-0002",
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    for index, offset in enumerate((179, 179, 180)):
        db_session.add(
            make_finding(
                finding_ref=f"FND-OLD-{index:04d}",
                audit_id=audit.id,
                root_cause_category=RootCauseCategory.DATA_QUALITY,
                identified_date=AS_OF - offset * DAY,
            )
        )
    db_session.flush()

    assert _hits_for(compute_risk(db_session, AS_OF), "R4_repeated_findings") == []


def test_rule4_counts_findings_of_any_status(db_session):
    audit = make_audit(
        audit_ref="AUD-STATUS-0001",
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    for index, status in enumerate(
        (FindingStatus.OPEN, FindingStatus.RESOLVED, FindingStatus.ACCEPTED)
    ):
        db_session.add(
            make_finding(
                finding_ref=f"FND-STATUS-{index:04d}",
                audit_id=audit.id,
                status=status,
                root_cause_category=RootCauseCategory.SYSTEM_LIMITATION,
                identified_date=AS_OF - 20 * DAY,
            )
        )
    db_session.flush()

    hits = _hits_for(compute_risk(db_session, AS_OF), "R4_repeated_findings")

    assert len(hits) == 1
    assert hits[0].evidence["count"] == 3


def test_rule4_keeps_departments_and_root_causes_separate(db_session):
    finance = make_audit(
        audit_ref="AUD-SPLIT-0001",
        department=Department.FINANCE,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    it = make_audit(
        audit_ref="AUD-SPLIT-0002",
        department=Department.IT,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add_all([finance, it])
    db_session.flush()

    # Two finance/process-gap, one finance/human-error, two IT/process-gap.
    for index, root_cause in enumerate(
        (RootCauseCategory.PROCESS_GAP, RootCauseCategory.PROCESS_GAP,
         RootCauseCategory.HUMAN_ERROR)
    ):
        db_session.add(
            make_finding(
                finding_ref=f"FND-SPLIT-F-{index:04d}",
                audit_id=finance.id,
                root_cause_category=root_cause,
                identified_date=AS_OF - 20 * DAY,
            )
        )
    for index in range(2):
        db_session.add(
            make_finding(
                finding_ref=f"FND-SPLIT-I-{index:04d}",
                audit_id=it.id,
                root_cause_category=RootCauseCategory.PROCESS_GAP,
                identified_date=AS_OF - 20 * DAY,
            )
        )
    db_session.flush()

    assert _hits_for(compute_risk(db_session, AS_OF), "R4_repeated_findings") == []


# ---------------------------------------------------------------------------
# Rule 5 - blocked action plans
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("severity", "expected_points"),
    [
        (FindingSeverity.LOW, 2),
        (FindingSeverity.MEDIUM, 5),
        (FindingSeverity.HIGH, 10),
        (FindingSeverity.CRITICAL, 20),
    ],
)
def test_rule5_scores_the_parent_finding_severity(db_session, severity, expected_points):
    _, finding = _add_finding(
        db_session,
        severity=severity,
        identified_date=AS_OF - 1 * DAY,
    )
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF + 10 * DAY,
            status=ActionStatus.BLOCKED,
        )
    )
    db_session.flush()

    hits = _hits_for(compute_risk(db_session, AS_OF), "R5_blocked_action")

    assert len(hits) == 1
    assert hits[0].points == expected_points


def test_rule5_blocked_and_overdue_is_scored_by_both_rules(db_session):
    _, finding = _add_finding(db_session)
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF - 10 * DAY,
            status=ActionStatus.BLOCKED,
        )
    )
    db_session.flush()

    risk = compute_risk(db_session, AS_OF)

    assert len(_hits_for(risk, "R1_overdue_action")) == 1
    assert len(_hits_for(risk, "R5_blocked_action")) == 1


# ---------------------------------------------------------------------------
# Rule 6 - weak controls
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("status", "effectiveness", "expected_points"),
    [
        (ControlStatus.ACTIVE, ControlEffectiveness.INEFFECTIVE, 15),
        (ControlStatus.ACTIVE, ControlEffectiveness.PARTIALLY_EFFECTIVE, 6),
        (ControlStatus.ACTIVE, ControlEffectiveness.EFFECTIVE, None),
        (ControlStatus.ACTIVE, ControlEffectiveness.NOT_TESTED, None),
        (ControlStatus.INACTIVE, ControlEffectiveness.INEFFECTIVE, None),
        (ControlStatus.RETIRED, ControlEffectiveness.PARTIALLY_EFFECTIVE, None),
    ],
)
def test_rule6_only_active_weak_controls_are_scored(
    db_session, status, effectiveness, expected_points
):
    db_session.add(
        make_control(
            control_ref="CTL-TEST-0001",
            department=Department.PROCUREMENT,
            status=status,
            effectiveness=effectiveness,
        )
    )
    db_session.flush()

    hits = _hits_for(compute_risk(db_session, AS_OF), "R6_weak_control")

    if expected_points is None:
        assert hits == []
    else:
        assert len(hits) == 1
        assert hits[0].points == expected_points
        assert hits[0].department is Department.PROCUREMENT


# ---------------------------------------------------------------------------
# Roll-ups and determinism
# ---------------------------------------------------------------------------
def test_department_mapping_and_open_finding_context(db_session):
    _, finding = _add_finding(
        db_session,
        severity=FindingSeverity.HIGH,
        status=FindingStatus.OPEN,
        department=Department.OPERATIONS,
        identified_date=AS_OF - 5 * DAY,
    )
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF - 5 * DAY,
        )
    )
    db_session.add(
        make_control(
            control_ref="CTL-OPS-0001",
            department=Department.OPERATIONS,
            status=ControlStatus.ACTIVE,
            effectiveness=ControlEffectiveness.INEFFECTIVE,
        )
    )
    db_session.flush()

    risk = compute_risk(db_session, AS_OF)
    operations = next(
        item for item in risk.departments
        if item.department is Department.OPERATIONS
    )

    assert all(hit.department is Department.OPERATIONS for hit in operations.hits)
    assert operations.open_findings.high == 1
    assert operations.open_findings.total == 1
    assert operations.score == sum(hit.points for hit in operations.hits)


def test_portfolio_totals_match_the_department_roll_up(db_session):
    _add_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
    )
    db_session.add(
        make_control(
            control_ref="CTL-TEST-0001",
            status=ControlStatus.ACTIVE,
            effectiveness=ControlEffectiveness.INEFFECTIVE,
        )
    )
    db_session.flush()

    risk = compute_risk(db_session, AS_OF)

    assert risk.score == sum(hit.points for hit in risk.hits)
    assert risk.score == sum(item.score for item in risk.departments)
    assert risk.band == band_for_score(risk.score)


def test_repeated_calls_are_identical(db_session):
    _, finding = _add_finding(db_session)
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF - 40 * DAY,
            status=ActionStatus.BLOCKED,
        )
    )
    db_session.flush()

    first = compute_risk(db_session, AS_OF)
    second = compute_risk(db_session, AS_OF)

    assert first == second
    assert first.as_of == AS_OF


# ---------------------------------------------------------------------------
# Full dataset integration
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def bundle():
    return SyntheticDatasetGenerator(seed=42).generate()


@pytest.fixture(scope="module")
def report(bundle):
    return validate_dataset(bundle)


def test_full_dataset_matches_documented_totals(db_session, bundle, report):
    load_dataset(db_session, bundle, report=report)

    risk = compute_risk(db_session, settings.synthetic_data_reference_date)

    assert risk.score == 1450
    assert len(risk.hits) == 123
    assert {
        item.rule_id: (item.hits, item.points) for item in risk.breakdown
    } == {
        "R1_overdue_action": (37, 473),
        "R2_unresolved_critical": (13, 490),
        "R3_stale_finding": (43, 208),
        "R4_repeated_findings": (11, 130),
        "R5_blocked_action": (8, 56),
        "R6_weak_control": (11, 93),
    }
    assert {
        item.department.value: item.score for item in risk.departments
    } == {
        "it": 530,
        "procurement": 356,
        "operations": 179,
        "human_resources": 167,
        "finance": 121,
        "compliance": 97,
    }
    assert risk.band == "critical"
    assert sum(item.score for item in risk.departments) == risk.score
