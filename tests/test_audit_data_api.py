"""HTTP contract tests for the read-only audit data API.

The endpoints expose the records behind the risk and anomaly views. Tests run
through FastAPI's TestClient against the isolated test database and assert that
the lists are read-only, date-aware and consistent with the risk engine.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.models.enums import (
    ActionStatus,
    AuditStatus,
    AuditType,
    Department,
    FindingSeverity,
    FindingStatus,
    RootCauseCategory,
)
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
    audit_type: AuditType = AuditType.FINANCIAL,
    title: str = "Test audit",
    lead_auditor: str = "T. Tester",
    start_date: date = AS_OF - 400 * DAY,
    end_date: date | None = AS_OF - 300 * DAY,
    status: AuditStatus = AuditStatus.COMPLETED,
):
    audit = make_audit(
        audit_ref=audit_ref,
        title=title,
        department=department,
        audit_type=audit_type,
        lead_auditor=lead_auditor,
        start_date=start_date,
        end_date=end_date,
        status=status,
    )
    db_session.add(audit)
    db_session.flush()
    return audit


def _seed_finding(
    db_session,
    *,
    audit,
    finding_ref: str,
    title: str = "Test finding",
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    status: FindingStatus = FindingStatus.OPEN,
    identified_date: date = AS_OF - 10 * DAY,
    root_cause: RootCauseCategory = RootCauseCategory.PROCESS_GAP,
):
    finding = make_finding(
        finding_ref=finding_ref,
        audit_id=audit.id,
        title=title,
        severity=severity,
        status=status,
        root_cause_category=root_cause,
        identified_date=identified_date,
    )
    db_session.add(finding)
    db_session.flush()
    return finding


def _seed_action(
    db_session,
    *,
    finding,
    assigned_owner: str = "T. Tester",
    action_description: str = "Remediate the finding",
    due_date: date = AS_OF - 5 * DAY,
    status: ActionStatus = ActionStatus.NOT_STARTED,
    completion_date: date | None = None,
):
    action = make_action(
        finding_id=finding.id,
        action_description=action_description,
        assigned_owner=assigned_owner,
        due_date=due_date,
        status=status,
        completion_date=completion_date,
    )
    db_session.add(action)
    db_session.flush()
    return action


# ---------------------------------------------------------------------------
# Audit directory
# ---------------------------------------------------------------------------
def test_audits_list_returns_directory_counts_and_ordering(client, db_session):
    older = _seed_audit(
        db_session,
        audit_ref="AUD-OLD",
        department=Department.FINANCE,
        audit_type=AuditType.FINANCIAL,
        title="Finance controls audit",
        lead_auditor="A. One",
        start_date=AS_OF - 400 * DAY,
        end_date=AS_OF - 300 * DAY,
        status=AuditStatus.COMPLETED,
    )
    _seed_audit(
        db_session,
        audit_ref="AUD-NEW",
        department=Department.IT,
        audit_type=AuditType.IT,
        title="IT controls audit",
        lead_auditor="B. Two",
        start_date=AS_OF - 200 * DAY,
        end_date=None,
        status=AuditStatus.IN_PROGRESS,
    )
    open_finding = _seed_finding(
        db_session,
        audit=older,
        finding_ref="FND-AUDIT-OPEN",
        severity=FindingSeverity.MEDIUM,
        status=FindingStatus.OPEN,
        identified_date=AS_OF - 10 * DAY,
    )
    resolved_finding = _seed_finding(
        db_session,
        audit=older,
        finding_ref="FND-AUDIT-RESOLVED",
        severity=FindingSeverity.HIGH,
        status=FindingStatus.RESOLVED,
        identified_date=AS_OF - 20 * DAY,
    )
    _seed_action(
        db_session,
        finding=open_finding,
        assigned_owner="Owner A",
        due_date=AS_OF - 5 * DAY,
        status=ActionStatus.NOT_STARTED,
    )
    _seed_action(
        db_session,
        finding=open_finding,
        assigned_owner="Owner B",
        due_date=AS_OF + 5 * DAY,
        status=ActionStatus.IN_PROGRESS,
    )
    _seed_action(
        db_session,
        finding=resolved_finding,
        assigned_owner="Owner C",
        due_date=AS_OF - 2 * DAY,
        status=ActionStatus.COMPLETED,
        completion_date=AS_OF - 3 * DAY,
    )

    payload = client.get("/audits").json()

    assert payload["as_of"] == "2026-10-31"
    assert payload["total"] == 2
    assert [item["audit_ref"] for item in payload["items"]] == [
        "AUD-NEW",
        "AUD-OLD",
    ]

    old = next(
        item for item in payload["items"] if item["audit_ref"] == "AUD-OLD"
    )
    assert old == {
        "audit_ref": "AUD-OLD",
        "title": "Finance controls audit",
        "department": "finance",
        "audit_type": "financial",
        "lead_auditor": "A. One",
        "start_date": "2025-09-26",
        "end_date": "2026-01-04",
        "status": "completed",
        "finding_count": 2,
        "open_finding_count": 1,
        "action_count": 3,
        "overdue_action_count": 1,
    }

    new = next(
        item for item in payload["items"] if item["audit_ref"] == "AUD-NEW"
    )
    assert new["finding_count"] == 0
    assert new["open_finding_count"] == 0
    assert new["action_count"] == 0
    assert new["overdue_action_count"] == 0


def test_audits_filters_search_and_as_of(client, db_session):
    _seed_audit(
        db_session,
        audit_ref="AUD-FIN",
        department=Department.FINANCE,
        audit_type=AuditType.FINANCIAL,
        title="Payroll controls review",
        lead_auditor="Alice",
        start_date=AS_OF - 300 * DAY,
        status=AuditStatus.COMPLETED,
    )
    _seed_audit(
        db_session,
        audit_ref="AUD-IT",
        department=Department.IT,
        audit_type=AuditType.IT,
        title="Access review",
        lead_auditor="Bob",
        start_date=AS_OF - 200 * DAY,
        end_date=None,
        status=AuditStatus.IN_PROGRESS,
    )
    _seed_audit(
        db_session,
        audit_ref="AUD-FUTURE",
        department=Department.FINANCE,
        audit_type=AuditType.COMPLIANCE,
        title="Future compliance review",
        lead_auditor="Carol",
        start_date=AS_OF + 10 * DAY,
        end_date=None,
        status=AuditStatus.PLANNED,
    )

    assert client.get("/audits").json()["total"] == 2
    assert [
        item["audit_ref"]
        for item in client.get(
            "/audits", params={"department": "finance"}
        ).json()["items"]
    ] == ["AUD-FIN"]
    assert [
        item["audit_ref"]
        for item in client.get(
            "/audits", params={"status": "in_progress"}
        ).json()["items"]
    ] == ["AUD-IT"]
    assert [
        item["audit_ref"]
        for item in client.get(
            "/audits", params={"audit_type": "financial"}
        ).json()["items"]
    ] == ["AUD-FIN"]
    assert [
        item["audit_ref"]
        for item in client.get(
            "/audits", params={"search": "payroll"}
        ).json()["items"]
    ] == ["AUD-FIN"]

    later = client.get(
        "/audits", params={"as_of": (AS_OF + 20 * DAY).isoformat()}
    ).json()
    assert later["total"] == 3
    assert later["items"][0]["audit_ref"] == "AUD-FUTURE"


# ---------------------------------------------------------------------------
# Finding directory
# ---------------------------------------------------------------------------
def test_findings_list_returns_risk_attribution_and_filters(client, db_session):
    audit = _seed_audit(
        db_session,
        audit_ref="AUD-FIND",
        department=Department.FINANCE,
        start_date=AS_OF - 500 * DAY,
    )
    critical = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-CRITICAL",
        title="Unapproved journal entry",
        severity=FindingSeverity.CRITICAL,
        status=FindingStatus.OPEN,
        identified_date=AS_OF - 100 * DAY,
    )
    _seed_action(
        db_session,
        finding=critical,
        due_date=AS_OF - 10 * DAY,
        status=ActionStatus.BLOCKED,
    )
    _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-LOW",
        title="Minor documentation gap",
        severity=FindingSeverity.LOW,
        status=FindingStatus.RESOLVED,
        identified_date=AS_OF - 5 * DAY,
    )

    payload = client.get("/findings").json()

    assert payload["as_of"] == "2026-10-31"
    assert payload["total"] == 2
    assert [item["finding_ref"] for item in payload["items"]] == [
        "FND-LOW",
        "FND-CRITICAL",
    ]

    crit = next(
        item
        for item in payload["items"]
        if item["finding_ref"] == "FND-CRITICAL"
    )
    assert crit["title"] == "Unapproved journal entry"
    assert crit["severity"] == "critical"
    assert crit["status"] == "open"
    assert crit["root_cause_category"] == "process_gap"
    assert crit["audit_ref"] == "AUD-FIND"
    assert crit["audit_title"] == "Test audit"
    assert crit["department"] == "finance"
    assert crit["control_ref"] is None
    assert crit["action_count"] == 1
    # R2 40 (critical, 100 days open) + R1 20 + R5 20 = 80.
    assert crit["risk_score"] == 80
    assert crit["risk_band"] == "medium"
    assert crit["rule_ids"] == [
        "R1_overdue_action",
        "R2_unresolved_critical",
        "R5_blocked_action",
    ]

    low = next(
        item for item in payload["items"] if item["finding_ref"] == "FND-LOW"
    )
    assert low["risk_score"] == 0
    assert low["risk_band"] == "low"
    assert low["rule_ids"] == []
    assert low["action_count"] == 0

    assert client.get(
        "/findings", params={"severity": "critical"}
    ).json()["total"] == 1
    assert client.get(
        "/findings", params={"status": "resolved"}
    ).json()["total"] == 1
    assert client.get(
        "/findings", params={"department": "finance"}
    ).json()["total"] == 2
    assert client.get(
        "/findings", params={"rule_id": "R2_unresolved_critical"}
    ).json()["total"] == 1
    assert client.get(
        "/findings", params={"audit_ref": "AUD-FIND"}
    ).json()["total"] == 2
    assert client.get(
        "/findings", params={"search": "journal"}
    ).json()["total"] == 1


def test_findings_as_of_excludes_future_identifications(client, db_session):
    audit = _seed_audit(
        db_session,
        audit_ref="AUD-FUTURE-FIND",
        start_date=AS_OF - 100 * DAY,
        end_date=None,
    )
    _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-FUTURE",
        identified_date=AS_OF + 10 * DAY,
    )

    before = client.get("/findings").json()
    after = client.get(
        "/findings", params={"as_of": (AS_OF + 20 * DAY).isoformat()}
    ).json()

    assert before["total"] == 0
    assert before["items"] == []
    assert after["total"] == 1
    assert after["items"][0]["finding_ref"] == "FND-FUTURE"


# ---------------------------------------------------------------------------
# Action-plan directory
# ---------------------------------------------------------------------------
def test_actions_include_owner_overdue_state_and_rule_hits(client, db_session):
    audit = _seed_audit(
        db_session,
        audit_ref="AUD-ACT",
        department=Department.OPERATIONS,
        start_date=AS_OF - 500 * DAY,
    )
    finding = _seed_finding(
        db_session,
        audit=audit,
        finding_ref="FND-ACT",
        severity=FindingSeverity.MEDIUM,
        status=FindingStatus.OPEN,
        identified_date=AS_OF - 100 * DAY,
    )
    overdue = _seed_action(
        db_session,
        finding=finding,
        assigned_owner="Alice",
        action_description="Update the SOP",
        due_date=AS_OF - 10 * DAY,
        status=ActionStatus.IN_PROGRESS,
    )
    blocked = _seed_action(
        db_session,
        finding=finding,
        assigned_owner="Bob",
        action_description="Raise the system change",
        due_date=AS_OF + 5 * DAY,
        status=ActionStatus.BLOCKED,
    )
    completed = _seed_action(
        db_session,
        finding=finding,
        assigned_owner="Carol",
        action_description="Complete the documentation",
        due_date=AS_OF - 10 * DAY,
        status=ActionStatus.COMPLETED,
        completion_date=AS_OF - 5 * DAY,
    )

    payload = client.get("/actions").json()

    assert payload["as_of"] == "2026-10-31"
    assert payload["total"] == 3
    by_id = {item["action_id"]: item for item in payload["items"]}

    overdue_item = by_id[overdue.id]
    assert overdue_item["assigned_owner"] == "Alice"
    assert overdue_item["finding_ref"] == "FND-ACT"
    assert overdue_item["finding_severity"] == "medium"
    assert overdue_item["audit_ref"] == "AUD-ACT"
    assert overdue_item["department"] == "operations"
    assert overdue_item["status"] == "in_progress"
    assert overdue_item["is_overdue"] is True
    assert overdue_item["days_overdue"] == 10
    # R1: medium finding weight 5 x 1.0 aging multiplier.
    assert overdue_item["rule_points"] == 5
    assert [hit["rule_id"] for hit in overdue_item["rule_hits"]] == [
        "R1_overdue_action"
    ]

    blocked_item = by_id[blocked.id]
    assert blocked_item["is_overdue"] is False
    assert blocked_item["days_overdue"] == 0
    assert blocked_item["rule_points"] == 5
    assert [hit["rule_id"] for hit in blocked_item["rule_hits"]] == [
        "R5_blocked_action"
    ]

    completed_item = by_id[completed.id]
    assert completed_item["is_overdue"] is False
    assert completed_item["status"] == "completed"
    assert completed_item["completion_date"] == "2026-10-26"
    assert completed_item["rule_points"] == 0
    assert completed_item["rule_hits"] == []

    assert client.get(
        "/actions", params={"overdue": "true"}
    ).json()["total"] == 1
    assert client.get(
        "/actions", params={"status": "blocked"}
    ).json()["total"] == 1
    assert client.get(
        "/actions", params={"finding_ref": "FND-ACT"}
    ).json()["total"] == 3
    assert client.get(
        "/actions", params={"audit_ref": "AUD-ACT"}
    ).json()["total"] == 3
    assert client.get(
        "/actions", params={"search": "Alice"}
    ).json()["total"] == 1


# ---------------------------------------------------------------------------
# Edge cases and full dataset
# ---------------------------------------------------------------------------
def test_empty_lists_and_invalid_filters(client):
    for path in ("/audits", "/findings", "/actions"):
        payload = client.get(path).json()
        assert payload["total"] == 0
        assert payload["items"] == []

    assert client.get(
        "/audits", params={"department": "sales"}
    ).status_code == 422
    assert client.get(
        "/findings", params={"severity": "urgent"}
    ).status_code == 422
    assert client.get(
        "/actions", params={"status": "done"}
    ).status_code == 422
    assert client.get(
        "/audits", params={"as_of": "not-a-date"}
    ).status_code == 422


def test_full_dataset_data_endpoints_match_seeded_counts(
    client, db_session, bundle, report
):
    load_dataset(db_session, bundle, report=report)

    risk_before = client.get("/risk/summary").json()
    audits = client.get("/audits").json()
    findings = client.get("/findings").json()
    actions = client.get("/actions").json()
    risk_after = client.get("/risk/summary").json()

    assert audits["total"] == 60
    assert findings["total"] == 197
    assert actions["total"] == 165
    assert sum(item["is_overdue"] for item in actions["items"]) == 37
    assert sum(item["risk_score"] > 0 for item in findings["items"]) == 58

    assert risk_before == risk_after
    assert risk_after["score"] == 1450
    assert risk_after["total_hits"] == 123
