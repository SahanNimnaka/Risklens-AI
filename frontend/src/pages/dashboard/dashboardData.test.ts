import { describe, expect, it } from "vitest";

import type {
  ActionPlanListItem,
  AuditAnomaly,
  AuditListItem,
  FindingListItem,
} from "../../api/types";
import {
  countActionsByStatus,
  countAuditsByStatus,
  countAuditsWithOpenFindings,
  countAuditsWithOverdueActions,
  countFindingsByStatus,
  selectLatestFindings,
  selectOverdueActions,
  selectPriorityFindings,
  selectTopAnomalies,
  summarizeActions,
} from "./dashboardData";

function finding(
  overrides: Partial<FindingListItem> = {},
): FindingListItem {
  return {
    finding_ref: "FND-TEST-0001",
    title: "Test finding",
    severity: "high",
    status: "open",
    root_cause_category: "process_gap",
    identified_date: "2026-01-01",
    audit_ref: "AUD-TEST-0001",
    audit_title: "Test audit",
    department: "finance",
    control_ref: null,
    action_count: 0,
    risk_score: 0,
    risk_band: "low",
    rule_ids: [],
    ...overrides,
  };
}

function action(
  overrides: Partial<ActionPlanListItem> = {},
): ActionPlanListItem {
  return {
    action_id: 1,
    action_description: "Test action",
    assigned_owner: "A. Owner",
    due_date: "2026-01-01",
    status: "not_started",
    completion_date: null,
    is_overdue: false,
    days_overdue: 0,
    finding_ref: "FND-TEST-0001",
    finding_title: "Test finding",
    finding_severity: "high",
    finding_status: "open",
    audit_ref: "AUD-TEST-0001",
    audit_title: "Test audit",
    department: "finance",
    rule_points: 0,
    rule_hits: [],
    ...overrides,
  };
}

function audit(overrides: Partial<AuditListItem> = {}): AuditListItem {
  return {
    audit_ref: "AUD-TEST-0001",
    title: "Test audit",
    department: "finance",
    audit_type: "financial",
    lead_auditor: "A. Auditor",
    start_date: "2026-01-01",
    end_date: null,
    status: "in_progress",
    finding_count: 0,
    open_finding_count: 0,
    action_count: 0,
    overdue_action_count: 0,
    ...overrides,
  };
}

function anomaly(overrides: Partial<AuditAnomaly> = {}): AuditAnomaly {
  return {
    audit_ref: "AUD-TEST-0001",
    audit_title: "Test audit",
    department: "finance",
    anomaly_score: 0.5,
    score_percentile: 50,
    is_anomaly: false,
    rule_points: 0,
    rule_ids: [],
    features: {},
    deviations: [],
    ...overrides,
  };
}

describe("status counts", () => {
  it("counts every finding status and fills missing ones with zero", () => {
    const items = [
      finding({ finding_ref: "F1", status: "open" }),
      finding({ finding_ref: "F2", status: "open" }),
      finding({ finding_ref: "F3", status: "resolved" }),
    ];

    expect(countFindingsByStatus(items)).toEqual({
      open: 2,
      in_progress: 0,
      resolved: 1,
      accepted: 0,
    });
  });

  it("counts all action statuses including blocked", () => {
    const items = [
      action({ action_id: 1, status: "blocked" }),
      action({ action_id: 2, status: "completed" }),
      action({ action_id: 3, status: "completed" }),
    ];

    expect(countActionsByStatus(items)).toEqual({
      not_started: 0,
      in_progress: 0,
      blocked: 1,
      completed: 2,
    });
  });

  it("counts audit statuses", () => {
    const items = [
      audit({ audit_ref: "A1", status: "completed" }),
      audit({ audit_ref: "A2", status: "completed" }),
      audit({ audit_ref: "A3", status: "cancelled" }),
    ];

    expect(countAuditsByStatus(items)).toEqual({
      planned: 0,
      in_progress: 0,
      completed: 2,
      cancelled: 1,
    });
  });
});

describe("priority findings", () => {
  it("keeps only unresolved high and critical findings", () => {
    const items = [
      finding({ finding_ref: "open-high", severity: "high", status: "open" }),
      finding({
        finding_ref: "progress-critical",
        severity: "critical",
        status: "in_progress",
      }),
      finding({ finding_ref: "resolved-high", severity: "high", status: "resolved" }),
      finding({ finding_ref: "accepted-critical", severity: "critical", status: "accepted" }),
      finding({ finding_ref: "open-medium", severity: "medium", status: "open" }),
      finding({ finding_ref: "open-low", severity: "low", status: "open" }),
    ];

    expect(selectPriorityFindings(items).map((item) => item.finding_ref)).toEqual([
      "progress-critical",
      "open-high",
    ]);
  });

  it("orders by direct risk score, then severity, date and reference", () => {
    const items = [
      finding({
        finding_ref: "B",
        risk_score: 40,
        severity: "high",
        identified_date: "2026-03-01",
      }),
      finding({
        finding_ref: "A",
        risk_score: 40,
        severity: "critical",
        identified_date: "2026-01-01",
      }),
      finding({
        finding_ref: "C",
        risk_score: 90,
        severity: "high",
        identified_date: "2026-01-01",
      }),
      finding({
        finding_ref: "D",
        risk_score: 40,
        severity: "high",
        identified_date: "2026-03-01",
      }),
    ];

    expect(selectPriorityFindings(items).map((item) => item.finding_ref)).toEqual([
      "C",
      "A",
      "B",
      "D",
    ]);
  });

  it("applies the limit without mutating the source array", () => {
    const items = [
      finding({ finding_ref: "F1", risk_score: 10 }),
      finding({ finding_ref: "F2", risk_score: 20 }),
      finding({ finding_ref: "F3", risk_score: 30 }),
    ];

    expect(selectPriorityFindings(items, 2).map((item) => item.finding_ref)).toEqual([
      "F3",
      "F2",
    ]);
    expect(items.map((item) => item.finding_ref)).toEqual(["F1", "F2", "F3"]);
  });

  it("returns an empty list when nothing is unresolved and severe", () => {
    expect(
      selectPriorityFindings([
        finding({ severity: "low", status: "open" }),
        finding({ severity: "critical", status: "resolved" }),
      ]),
    ).toEqual([]);
  });
});

describe("latest findings", () => {
  it("orders newest identification first and applies the limit", () => {
    const items = [
      finding({ finding_ref: "old", identified_date: "2025-01-01" }),
      finding({ finding_ref: "new", identified_date: "2026-09-01" }),
      finding({ finding_ref: "mid", identified_date: "2026-02-01" }),
    ];

    expect(selectLatestFindings(items, 2).map((item) => item.finding_ref)).toEqual([
      "new",
      "mid",
    ]);
    expect(items.map((item) => item.finding_ref)).toEqual(["old", "new", "mid"]);
  });
});

describe("action summary", () => {
  it("counts overdue and blocked actions using API values", () => {
    const items = [
      action({ action_id: 1, is_overdue: true, days_overdue: 12 }),
      action({ action_id: 2, is_overdue: true, days_overdue: 4 }),
      action({ action_id: 3, status: "blocked", is_overdue: false }),
      action({ action_id: 4, status: "completed" }),
    ];

    expect(summarizeActions(items)).toEqual({
      total: 4,
      overdue: 2,
      blocked: 1,
      byStatus: {
        not_started: 2,
        in_progress: 0,
        blocked: 1,
        completed: 1,
      },
    });
  });

  it("orders overdue actions by days overdue and applies the limit", () => {
    const items = [
      action({ action_id: 1, is_overdue: true, days_overdue: 5 }),
      action({ action_id: 2, is_overdue: true, days_overdue: 40 }),
      action({ action_id: 3, is_overdue: true, days_overdue: 20 }),
      action({ action_id: 4, is_overdue: false, days_overdue: 0 }),
    ];

    expect(selectOverdueActions(items, 2).map((item) => item.action_id)).toEqual([
      2,
      3,
    ]);
  });
});

describe("audit counts", () => {
  it("counts audits with overdue actions and open findings", () => {
    const items = [
      audit({ audit_ref: "A1", overdue_action_count: 2, open_finding_count: 1 }),
      audit({ audit_ref: "A2", overdue_action_count: 0, open_finding_count: 0 }),
      audit({ audit_ref: "A3", overdue_action_count: 0, open_finding_count: 3 }),
    ];

    expect(countAuditsWithOverdueActions(items)).toBe(1);
    expect(countAuditsWithOpenFindings(items)).toBe(2);
  });
});

describe("anomaly ranking", () => {
  it("orders by anomaly score and applies the limit", () => {
    const items = [
      anomaly({ audit_ref: "A1", anomaly_score: 0.1 }),
      anomaly({ audit_ref: "A2", anomaly_score: 0.9 }),
      anomaly({ audit_ref: "A3", anomaly_score: 0.5 }),
    ];

    expect(selectTopAnomalies(items, 2).map((item) => item.audit_ref)).toEqual([
      "A2",
      "A3",
    ]);
  });
});

describe("empty input", () => {
  it("returns zeroed records and empty lists", () => {
    expect(countFindingsByStatus([]).open).toBe(0);
    expect(countActionsByStatus([]).completed).toBe(0);
    expect(countAuditsByStatus([]).planned).toBe(0);
    expect(selectPriorityFindings([])).toEqual([]);
    expect(selectLatestFindings([])).toEqual([]);
    expect(selectOverdueActions([])).toEqual([]);
    expect(selectTopAnomalies([])).toEqual([]);
  });
});
