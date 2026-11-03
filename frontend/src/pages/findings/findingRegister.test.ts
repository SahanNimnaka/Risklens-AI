import { describe, expect, it } from "vitest";

import type { FindingListItem } from "../../api/types";
import {
  DEFAULT_FINDING_SORT,
  nextFindingSort,
  sortFindings,
  summarizeFindings,
  type FindingSort,
} from "./findingRegister";

function finding(overrides: Partial<FindingListItem> = {}): FindingListItem {
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

const ascending: FindingSort = { key: "finding_ref", direction: "asc" };
const descending: FindingSort = { key: "finding_ref", direction: "desc" };

describe("sortFindings", () => {
  it("sorts finding severity by its domain order, not alphabetically", () => {
    const items = [
      finding({ finding_ref: "D", severity: "critical" }),
      finding({ finding_ref: "B", severity: "medium" }),
      finding({ finding_ref: "A", severity: "low" }),
      finding({ finding_ref: "C", severity: "high" }),
    ];

    expect(
      sortFindings(items, { key: "severity", direction: "asc" }).map(
        (item) => item.finding_ref,
      ),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("sorts finding status by its workflow order", () => {
    const items = [
      finding({ finding_ref: "D", status: "accepted" }),
      finding({ finding_ref: "C", status: "resolved" }),
      finding({ finding_ref: "A", status: "open" }),
      finding({ finding_ref: "B", status: "in_progress" }),
    ];

    expect(
      sortFindings(items, { key: "status", direction: "asc" }).map(
        (item) => item.finding_ref,
      ),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("sorts direct scores descending and breaks ties by finding reference", () => {
    const items = [
      finding({ finding_ref: "B", risk_score: 20 }),
      finding({ finding_ref: "A", risk_score: 20 }),
      finding({ finding_ref: "C", risk_score: 40 }),
      finding({ finding_ref: "D", risk_score: 0 }),
    ];

    expect(
      sortFindings(items, { key: "risk_score", direction: "desc" }).map(
        (item) => item.finding_ref,
      ),
    ).toEqual(["C", "A", "B", "D"]);
  });

  it("sorts identified dates descending and does not mutate the API array", () => {
    const items = [
      finding({ finding_ref: "A", identified_date: "2026-01-01" }),
      finding({ finding_ref: "B", identified_date: "2026-06-01" }),
      finding({ finding_ref: "C", identified_date: "2026-03-01" }),
    ];

    const sorted = sortFindings(items, DEFAULT_FINDING_SORT);

    expect(sorted.map((item) => item.finding_ref)).toEqual(["B", "C", "A"]);
    expect(items.map((item) => item.finding_ref)).toEqual(["A", "B", "C"]);
  });

  it("sorts text columns case-insensitively", () => {
    const items = [
      finding({ finding_ref: "A1", title: "payroll review" }),
      finding({ finding_ref: "A2", title: "Accounts payable" }),
      finding({ finding_ref: "A3", title: "Capital projects" }),
    ];

    expect(
      sortFindings(items, { key: "title", direction: "asc" }).map(
        (item) => item.finding_ref,
      ),
    ).toEqual(["A2", "A3", "A1"]);
  });

  it("applies the requested direction to the finding reference", () => {
    const items = [
      finding({ finding_ref: "A1" }),
      finding({ finding_ref: "A3" }),
      finding({ finding_ref: "A2" }),
    ];

    expect(
      sortFindings(items, ascending).map((item) => item.finding_ref),
    ).toEqual(["A1", "A2", "A3"]);
    expect(
      sortFindings(items, descending).map((item) => item.finding_ref),
    ).toEqual(["A3", "A2", "A1"]);
  });
});

describe("nextFindingSort", () => {
  it("uses the natural direction when a new column is selected", () => {
    expect(nextFindingSort(DEFAULT_FINDING_SORT, "title")).toEqual({
      key: "title",
      direction: "asc",
    });
    expect(nextFindingSort(DEFAULT_FINDING_SORT, "risk_score")).toEqual({
      key: "risk_score",
      direction: "desc",
    });
  });

  it("toggles direction when the active column is selected again", () => {
    expect(
      nextFindingSort({ key: "title", direction: "asc" }, "title"),
    ).toEqual({ key: "title", direction: "desc" });
    expect(
      nextFindingSort({ key: "title", direction: "desc" }, "title"),
    ).toEqual({ key: "title", direction: "asc" });
  });
});

describe("summarizeFindings", () => {
  it("adds the API-supplied severity, status, rule and score values", () => {
    const items = [
      finding({
        finding_ref: "A1",
        severity: "critical",
        status: "open",
        risk_score: 30,
        rule_ids: ["R2_unresolved_critical"],
      }),
      finding({
        finding_ref: "A2",
        severity: "high",
        status: "in_progress",
        risk_score: 12,
        rule_ids: ["R3_stale_finding"],
      }),
      finding({
        finding_ref: "A3",
        severity: "medium",
        status: "resolved",
        risk_score: 0,
        rule_ids: [],
      }),
      finding({
        finding_ref: "A4",
        severity: "low",
        status: "accepted",
        risk_score: 0,
        rule_ids: [],
      }),
    ];

    expect(summarizeFindings(items)).toEqual({
      highCritical: 2,
      unresolved: 2,
      withRuleHits: 2,
      directPoints: 42,
    });
  });

  it("returns zeroed totals for an empty register", () => {
    expect(summarizeFindings([])).toEqual({
      highCritical: 0,
      unresolved: 0,
      withRuleHits: 0,
      directPoints: 0,
    });
  });
});
