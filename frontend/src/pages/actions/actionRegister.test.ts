import { describe, expect, it } from "vitest";

import type { ActionPlanListItem } from "../../api/types";
import {
  DEFAULT_ACTION_SORT,
  nextActionSort,
  sortActions,
  summarizeActions,
  type ActionSort,
} from "./actionRegister";

function action(
  overrides: Partial<ActionPlanListItem> = {},
): ActionPlanListItem {
  return {
    action_id: 1,
    action_description: "Test action",
    assigned_owner: "A. Owner",
    due_date: "2026-06-01",
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

const ascending: ActionSort = { key: "action_id", direction: "asc" };
const descending: ActionSort = { key: "action_id", direction: "desc" };

describe("sortActions", () => {
  it("sorts due dates ascending by default and does not mutate the API array", () => {
    const items = [
      action({ action_id: 1, due_date: "2026-08-01" }),
      action({ action_id: 2, due_date: "2026-05-01" }),
      action({ action_id: 3, due_date: "2026-06-01" }),
    ];

    const sorted = sortActions(items, DEFAULT_ACTION_SORT);

    expect(sorted.map((item) => item.action_id)).toEqual([2, 3, 1]);
    expect(items.map((item) => item.action_id)).toEqual([1, 2, 3]);
  });

  it("sorts status by urgency with blocked first and completed last", () => {
    const items = [
      action({ action_id: 1, status: "completed" }),
      action({ action_id: 2, status: "not_started" }),
      action({ action_id: 3, status: "blocked" }),
      action({ action_id: 4, status: "in_progress" }),
    ];

    expect(
      sortActions(items, { key: "status", direction: "asc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([3, 2, 4, 1]);
  });

  it("keeps missing completion dates last in both directions", () => {
    const items = [
      action({ action_id: 1, completion_date: null }),
      action({ action_id: 2, completion_date: "2026-05-01" }),
      action({ action_id: 3, completion_date: "2026-07-01" }),
    ];

    expect(
      sortActions(items, { key: "completion_date", direction: "asc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([2, 3, 1]);
    expect(
      sortActions(items, { key: "completion_date", direction: "desc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([3, 2, 1]);
  });

  it("sorts overdue days and rule points descending", () => {
    const items = [
      action({ action_id: 1, days_overdue: 5, rule_points: 10 }),
      action({ action_id: 2, days_overdue: 40, rule_points: 30 }),
      action({ action_id: 3, days_overdue: 0, rule_points: 0 }),
    ];

    expect(
      sortActions(items, { key: "days_overdue", direction: "desc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([2, 1, 3]);
    expect(
      sortActions(items, { key: "rule_points", direction: "desc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([2, 1, 3]);
  });

  it("sorts finding severity by its domain order", () => {
    const items = [
      action({ action_id: 1, finding_severity: "critical" }),
      action({ action_id: 2, finding_severity: "low" }),
      action({ action_id: 3, finding_severity: "high" }),
      action({ action_id: 4, finding_severity: "medium" }),
    ];

    expect(
      sortActions(items, { key: "finding_severity", direction: "asc" }).map(
        (item) => item.action_id,
      ),
    ).toEqual([2, 4, 3, 1]);
  });

  it("breaks ties by action id and applies the requested direction", () => {
    const items = [
      action({ action_id: 3, due_date: "2026-06-01" }),
      action({ action_id: 1, due_date: "2026-06-01" }),
      action({ action_id: 2, due_date: "2026-06-01" }),
    ];

    expect(sortActions(items, ascending).map((item) => item.action_id)).toEqual(
      [1, 2, 3],
    );
    expect(
      sortActions(items, descending).map((item) => item.action_id),
    ).toEqual([3, 2, 1]);
  });
});

describe("nextActionSort", () => {
  it("uses the natural direction when a new column is selected", () => {
    expect(nextActionSort(DEFAULT_ACTION_SORT, "assigned_owner")).toEqual({
      key: "assigned_owner",
      direction: "asc",
    });
    expect(nextActionSort(DEFAULT_ACTION_SORT, "days_overdue")).toEqual({
      key: "days_overdue",
      direction: "desc",
    });
  });

  it("toggles direction when the active column is selected again", () => {
    expect(
      nextActionSort({ key: "due_date", direction: "asc" }, "due_date"),
    ).toEqual({ key: "due_date", direction: "desc" });
    expect(
      nextActionSort({ key: "due_date", direction: "desc" }, "due_date"),
    ).toEqual({ key: "due_date", direction: "asc" });
  });
});

describe("summarizeActions", () => {
  it("adds API-supplied overdue state, blocked status and rule points", () => {
    const items = [
      action({ action_id: 1, is_overdue: true, status: "blocked", rule_points: 30 }),
      action({ action_id: 2, is_overdue: true, status: "not_started", rule_points: 10 }),
      action({ action_id: 3, is_overdue: false, status: "blocked", rule_points: 20 }),
      action({ action_id: 4, is_overdue: false, status: "completed", rule_points: 0 }),
    ];

    expect(summarizeActions(items)).toEqual({
      overdue: 2,
      blocked: 2,
      rulePoints: 60,
    });
  });

  it("returns zeroed totals for an empty register", () => {
    expect(summarizeActions([])).toEqual({
      overdue: 0,
      blocked: 0,
      rulePoints: 0,
    });
  });
});
