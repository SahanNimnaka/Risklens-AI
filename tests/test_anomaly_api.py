"""HTTP contract tests for the read-only anomaly API.

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
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
from app.modules.anomaly_detection import FEATURE_NAMES
from app.modules.synthetic_data.generator import SyntheticDatasetGenerator
from app.modules.synthetic_data.loader import load_dataset
from app.modules.synthetic_data.validation import validate_dataset
from tests.support import make_action, make_audit, make_finding

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


def _seed_audit(
    db_session,
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
    db_session.add(audit)
    db_session.flush()
    return audit


def _seed_finding(
    db_session,
    *,
    audit,
    finding_ref: str,
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    status: FindingStatus = FindingStatus.OPEN,
    identified_date: date = AS_OF - 10 * DAY,
    root_cause: RootCauseCategory = RootCauseCategory.PROCESS_GAP,
):
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
    return finding


def _seed_risky_and_clean_audits(db_session):
    """Two eligible audits: one with three rule hits, one with none."""
    risky = _seed_audit(db_session, audit_ref="AUD-ANOM-RISKY")
    critical = _seed_finding(
        db_session,
        audit=risky,
        finding_ref="FND-ANOM-RISKY",
        severity=FindingSeverity.CRITICAL,
        identified_date=AS_OF - 100 * DAY,
    )
    db_session.add(
        make_action(
            finding_id=critical.id,
            due_date=AS_OF - 10 * DAY,
            status=ActionStatus.BLOCKED,
        )
    )
    db_session.flush()

    clean = _seed_audit(
        db_session,
        audit_ref="AUD-ANOM-CLEAN",
        department=Department.IT,
    )
    _seed_finding(
        db_session,
        audit=clean,
        finding_ref="FND-ANOM-CLEAN",
        severity=FindingSeverity.LOW,
        status=FindingStatus.RESOLVED,
        identified_date=AS_OF - 10 * DAY,
        root_cause=RootCauseCategory.HUMAN_ERROR,
    )
    return risky, clean


# ---------------------------------------------------------------------------
# List endpoint
# ---------------------------------------------------------------------------
def test_list_returns_ranked_results_metadata_and_rule_context(
    client, db_session
):
    risky, clean = _seed_risky_and_clean_audits(db_session)

    response = client.get("/anomalies/audits")

    assert response.status_code == 200
    payload = response.json()
    assert payload["as_of"] == "2026-10-31"
    assert payload["detector"] == {
        "method": "IsolationForest",
        "n_estimators": 200,
        "contamination": 0.1,
        "random_state": 42,
        "min_peer_audits": 8,
        "feature_names": list(FEATURE_NAMES),
    }
    assert "advisory" in payload["disclaimer"]
    assert payload["total"] == 2
    assert payload["flagged"] == sum(
        item["is_anomaly"] for item in payload["audits"]
    )

    scores = [item["anomaly_score"] for item in payload["audits"]]
    assert scores == sorted(scores, reverse=True)

    by_ref = {item["audit_ref"]: item for item in payload["audits"]}
    risky_payload = by_ref[risky.audit_ref]
    assert risky_payload["department"] == "finance"
    assert risky_payload["rule_points"] == 80
    assert risky_payload["rule_ids"] == [
        "R1_overdue_action",
        "R2_unresolved_critical",
        "R5_blocked_action",
    ]
    assert risky_payload["features"]["finding_count"] == 1
    assert len(risky_payload["deviations"]) <= 3
    assert {item["feature"] for item in risky_payload["deviations"]} <= set(
        FEATURE_NAMES
    )

    clean_payload = by_ref[clean.audit_ref]
    assert clean_payload["rule_points"] == 0
    assert clean_payload["rule_ids"] == []


def test_list_as_of_excludes_findings_identified_after_the_date(client, db_session):
    for index in (1, 2):
        audit = _seed_audit(db_session, audit_ref=f"AUD-ANOM-FUTURE-{index}")
        _seed_finding(
            db_session,
            audit=audit,
            finding_ref=f"FND-ANOM-FUTURE-{index}",
            identified_date=AS_OF + 10 * DAY,
        )

    before = client.get("/anomalies/audits").json()
    after = client.get(
        "/anomalies/audits",
        params={"as_of": (AS_OF + 20 * DAY).isoformat()},
    ).json()

    assert before["total"] == 0
    assert before["audits"] == []
    assert before["flagged"] == 0
    assert after["total"] == 2
    assert {item["audit_ref"] for item in after["audits"]} == {
        "AUD-ANOM-FUTURE-1",
        "AUD-ANOM-FUTURE-2",
    }


def test_list_rejects_an_invalid_as_of(client):
    response = client.get("/anomalies/audits", params={"as_of": "not-a-date"})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Detail endpoint
# ---------------------------------------------------------------------------
def test_detail_returns_every_feature_deviation(client, db_session):
    risky, _ = _seed_risky_and_clean_audits(db_session)

    response = client.get(f"/anomalies/audits/{risky.audit_ref}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["audit_ref"] == risky.audit_ref
    assert payload["as_of"] == "2026-10-31"
    assert payload["department"] == "finance"
    assert payload["rule_points"] == 80
    assert len(payload["deviations"]) <= 3
    assert len(payload["all_deviations"]) == len(FEATURE_NAMES)
    assert {item["feature"] for item in payload["all_deviations"]} == set(
        FEATURE_NAMES
    )
    magnitudes = [abs(item["robust_z"]) for item in payload["all_deviations"]]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_detail_returns_404_for_unknown_or_ineligible_audit(client, db_session):
    _seed_audit(db_session, audit_ref="AUD-ANOM-NO-FINDINGS")

    unknown = client.get("/anomalies/audits/AUD-DOES-NOT-EXIST")
    ineligible = client.get("/anomalies/audits/AUD-ANOM-NO-FINDINGS")

    assert unknown.status_code == 404
    assert ineligible.status_code == 404
    assert "no anomaly result" in ineligible.json()["detail"]


# ---------------------------------------------------------------------------
# Full dataset through HTTP
# ---------------------------------------------------------------------------
def test_full_dataset_anomaly_api_is_advisory_and_risk_is_unchanged(
    client, db_session, bundle, report
):
    load_dataset(db_session, bundle, report=report)

    risk_before = client.get("/risk/summary").json()
    payload = client.get("/anomalies/audits").json()
    risk_after = client.get("/risk/summary").json()

    assert payload["total"] == 56
    assert payload["flagged"] == 6
    assert payload["audits"][0]["audit_ref"] == "AUD-2025-0005"
    assert payload["audits"][0]["is_anomaly"] is True
    assert payload["audits"][0]["rule_points"] == 0
    assert payload["audits"][0]["rule_ids"] == []

    zero_rule_flags = [
        item
        for item in payload["audits"]
        if item["is_anomaly"] and item["rule_points"] == 0
    ]
    assert len(zero_rule_flags) == 1

    detail = client.get("/anomalies/audits/AUD-2025-0005").json()
    assert detail["rule_points"] == 0
    assert len(detail["all_deviations"]) == len(FEATURE_NAMES)
    assert detail["deviations"][0]["feature"] == "mean_remediation_window_days"
    assert detail["deviations"][0]["direction"] == "above_peer"

    assert risk_before == risk_after
    assert risk_after["score"] == 1450
    assert risk_after["band"] == "critical"
    assert risk_after["total_hits"] == 123
