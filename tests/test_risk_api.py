"""HTTP contract tests for the read-only risk API.

Requests run through FastAPI's TestClient against the isolated test database.
The ``get_db`` dependency is overridden with the test's savepoint session, so
endpoint reads see the seeded rows and every test is rolled back afterwards.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.models.enums import (
    ActionStatus,
    ControlEffectiveness,
    ControlStatus,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.synthetic_data.generator import SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import load_dataset
from app.modules.synthetic_data.validation import validate_dataset
from tests.support import make_action, make_audit, make_control, make_finding

AS_OF = date(2026, 10, 31)
DAY = timedelta(days=1)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def bundle():
    return SyntheticDatasetGenerator(seed=42).generate()


@pytest.fixture(scope="module")
def report(bundle):
    return validate_dataset(bundle)


def _seed_finding(
    db_session,
    *,
    department: Department = Department.FINANCE,
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    status: FindingStatus = FindingStatus.OPEN,
    identified_date: date = AS_OF - 10 * DAY,
    root_cause: RootCauseCategory = RootCauseCategory.PROCESS_GAP,
    audit_ref: str = "AUD-API-0001",
    finding_ref: str = "FND-API-0001",
    audit=None,
):
    if audit is None:
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
# Rule catalog
# ---------------------------------------------------------------------------
def test_rules_catalog_exposes_rules_thresholds_and_bands(client):
    response = client.get("/risk/rules")

    assert response.status_code == 200
    payload = response.json()
    assert [rule["id"] for rule in payload["rules"]] == [
        "R1_overdue_action",
        "R2_unresolved_critical",
        "R3_stale_finding",
        "R4_repeated_findings",
        "R5_blocked_action",
        "R6_weak_control",
    ]
    assert payload["bands"] == [
        {"name": "low", "min_score": 0, "max_score": 74},
        {"name": "medium", "min_score": 75, "max_score": 149},
        {"name": "high", "min_score": 150, "max_score": 299},
        {"name": "critical", "min_score": 300, "max_score": None},
    ]
    assert payload["severity_points"] == {
        "low": 2,
        "medium": 5,
        "high": 10,
        "critical": 20,
    }
    assert payload["rules"][0]["scoring"]["rounding"] == "half_up"
    assert len(payload["rules"][0]["scoring"]["aging_buckets"]) == 4
    assert payload["rules"][5]["scoring"]["points"] == {
        "ineffective": 15,
        "partially_effective": 6,
    }


# ---------------------------------------------------------------------------
# Summary and as-of handling
# ---------------------------------------------------------------------------
def test_summary_uses_the_reference_date_by_default(client, db_session):
    _seed_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
    )
    db_session.add(
        make_control(
            control_ref="CTL-API-0001",
            department=Department.FINANCE,
            status=ControlStatus.ACTIVE,
            effectiveness=ControlEffectiveness.INEFFECTIVE,
        )
    )
    db_session.flush()

    payload = client.get("/risk/summary").json()

    assert payload["as_of"] == "2026-10-31"
    assert payload["score"] == 55
    assert payload["band"] == "low"
    assert payload["total_hits"] == 2
    finance = next(
        item
        for item in payload["departments"]
        if item["department"] == "finance"
    )
    assert finance["score"] == 55
    assert finance["open_findings"] == {
        "low": 0,
        "medium": 0,
        "high": 0,
        "critical": 1,
        "total": 1,
    }
    assert len(payload["breakdown"]) == 6


def test_summary_as_of_changes_which_findings_are_scored(client, db_session):
    _seed_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF + 10 * DAY,
    )

    before = client.get("/risk/summary").json()
    after = client.get(
        "/risk/summary",
        params={"as_of": (AS_OF + 20 * DAY).isoformat()},
    ).json()

    assert before["score"] == 0
    assert after["score"] == 20
    assert after["total_hits"] == 1


def test_summary_rejects_an_invalid_as_of(client):
    response = client.get("/risk/summary", params={"as_of": "not-a-date"})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Department endpoints
# ---------------------------------------------------------------------------
def test_departments_are_ranked_and_include_context(client, db_session):
    it_audit = make_audit(
        audit_ref="AUD-API-IT",
        department=Department.IT,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    finance_audit = make_audit(
        audit_ref="AUD-API-FIN",
        department=Department.FINANCE,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add_all([it_audit, finance_audit])
    db_session.flush()

    for index in range(2):
        _seed_finding(
            db_session,
            audit=it_audit,
            department=Department.IT,
            severity=FindingSeverity.CRITICAL,
            identified_date=AS_OF - 100 * DAY,
            finding_ref=f"FND-API-IT-{index}",
        )
    _seed_finding(
        db_session,
        audit=finance_audit,
        department=Department.FINANCE,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
        finding_ref="FND-API-FIN-0",
    )

    payload = client.get("/risk/departments").json()

    assert len(payload) == 6
    assert payload[0]["department"] == "it"
    assert payload[0]["score"] == 80
    assert payload[0]["hit_count"] == 2
    assert len(payload[0]["breakdown"]) == 6
    assert payload[0]["open_findings"]["critical"] == 2
    assert payload[1]["department"] == "finance"
    assert payload[1]["score"] == 40


def test_department_detail_returns_every_hit(client, db_session):
    _, finding = _seed_finding(
        db_session,
        severity=FindingSeverity.HIGH,
        identified_date=AS_OF - 100 * DAY,
    )
    db_session.add(
        make_action(
            finding_id=finding.id,
            due_date=AS_OF - 10 * DAY,
            status=ActionStatus.BLOCKED,
        )
    )
    db_session.flush()

    response = client.get("/risk/departments/finance")

    assert response.status_code == 200
    payload = response.json()
    assert payload["department"] == "finance"
    assert payload["score"] == sum(hit["points"] for hit in payload["hits"])
    assert {hit["rule_id"] for hit in payload["hits"]} == {
        "R1_overdue_action",
        "R3_stale_finding",
        "R5_blocked_action",
    }
    assert all(hit["department"] == "finance" for hit in payload["hits"])


def test_department_rejects_an_unknown_value(client):
    response = client.get("/risk/departments/sales")

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Finding endpoint
# ---------------------------------------------------------------------------
def test_finding_detail_shows_direct_and_recurrence_hits(client, db_session):
    audit = make_audit(
        audit_ref="AUD-API-FIND",
        department=Department.OPERATIONS,
        start_date=AS_OF - 500 * DAY,
        end_date=AS_OF,
    )
    db_session.add(audit)
    db_session.flush()

    _, target = _seed_finding(
        db_session,
        audit=audit,
        department=Department.OPERATIONS,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
        root_cause=RootCauseCategory.DATA_QUALITY,
        finding_ref="FND-API-TARGET",
    )
    for index in range(2):
        _seed_finding(
            db_session,
            audit=audit,
            department=Department.OPERATIONS,
            severity=FindingSeverity.MEDIUM,
            identified_date=AS_OF - 10 * DAY,
            root_cause=RootCauseCategory.DATA_QUALITY,
            finding_ref=f"FND-API-PEER-{index}",
        )

    response = client.get(f"/risk/findings/{target.finding_ref}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["finding_ref"] == "FND-API-TARGET"
    assert payload["audit_ref"] == "AUD-API-FIND"
    assert payload["department"] == "operations"
    assert payload["included_in_scoring"] is True
    assert [hit["rule_id"] for hit in payload["hits"]] == [
        "R2_unresolved_critical"
    ]
    assert payload["score"] == 40
    assert len(payload["related_department_hits"]) == 1
    assert payload["related_department_hits"][0]["rule_id"] == "R4_repeated_findings"
    assert payload["related_department_hits"][0]["points"] == 5


def test_finding_detail_returns_404_for_unknown_ref(client):
    response = client.get("/risk/findings/FND-DOES-NOT-EXIST")

    assert response.status_code == 404
    assert "was not found" in response.json()["detail"]


def test_finding_after_as_of_is_reported_but_not_scored(client, db_session):
    _, finding = _seed_finding(
        db_session,
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF + 10 * DAY,
    )

    payload = client.get(f"/risk/findings/{finding.finding_ref}").json()

    assert payload["included_in_scoring"] is False
    assert payload["score"] == 0
    assert payload["hits"] == []
    assert payload["related_department_hits"] == []


# ---------------------------------------------------------------------------
# Full dataset through HTTP
# ---------------------------------------------------------------------------
def test_full_dataset_summary_and_detail_match_the_engine_totals(
    client, db_session, bundle, report
):
    load_dataset(db_session, bundle, report=report)

    summary = client.get("/risk/summary").json()

    assert summary["score"] == 1450
    assert summary["band"] == "critical"
    assert summary["total_hits"] == 123
    assert {
        item["department"]: item["score"] for item in summary["departments"]
    } == {
        "it": 530,
        "procurement": 356,
        "operations": 179,
        "human_resources": 167,
        "finance": 121,
        "compliance": 97,
    }

    detail = client.get("/risk/departments/it").json()

    assert detail["score"] == 530
    assert detail["hit_count"] == 41
    assert len(detail["hits"]) == 41
    assert sum(hit["points"] for hit in detail["hits"]) == 530
