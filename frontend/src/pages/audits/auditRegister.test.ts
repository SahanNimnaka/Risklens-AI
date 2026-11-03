import { describe, expect, it } from "vitest";

import type { AuditListItem } from "../../api/types";
import {
  DEFAULT_AUDIT_SORT,
  nextAuditSort,
  sortAudits,
  summarizeAudits,
  type AuditSort,
} from "./auditRegister";

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

const ascending: AuditSort = { key: "audit_ref", direction: "asc" };
const descending: AuditSort = { key: "audit_ref", direction: "desc" };

describe("sortAudits", () => {
  it("sorts text columns case-insensitively", () => {
    const items = [
      audit({ audit_ref: "A1", title: "payroll review" }),
      audit({ audit_ref: "A2", title: "Accounts payable" }),
      audit({ audit_ref: "A3", title: "Capital projects" }),
    ];

    expect(
      sortAudits(items, { key: "title", direction: "asc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["A2", "A3", "A1"]);
  });

  it("sorts numeric columns descending and breaks ties by audit reference", () => {
    const items = [
      audit({ audit_ref: "B", finding_count: 4 }),
      audit({ audit_ref: "A", finding_count: 4 }),
      audit({ audit_ref: "C", finding_count: 9 }),
      audit({ audit_ref: "D", finding_count: 0 }),
    ];

    expect(
      sortAudits(items, { key: "finding_count", direction: "desc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["C", "A", "B", "D"]);
  });

  it("keeps missing end dates last in both directions", () => {
    const items = [
      audit({ audit_ref: "A", end_date: null }),
      audit({ audit_ref: "B", end_date: "2026-03-01" }),
      audit({ audit_ref: "C", end_date: "2026-01-01" }),
    ];

    expect(
      sortAudits(items, { key: "end_date", direction: "asc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["C", "B", "A"]);
    expect(
      sortAudits(items, { key: "end_date", direction: "desc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["B", "C", "A"]);
  });

  it("does not mutate the API array", () => {
    const items = [
      audit({ audit_ref: "A", start_date: "2026-01-01" }),
      audit({ audit_ref: "B", start_date: "2026-06-01" }),
    ];

    const sorted = sortAudits(items, DEFAULT_AUDIT_SORT);

    expect(sorted.map((item) => item.audit_ref)).toEqual(["B", "A"]);
    expect(items.map((item) => item.audit_ref)).toEqual(["A", "B"]);
  });

  it("applies the requested direction to the audit reference", () => {
    const items = [
      audit({ audit_ref: "A1" }),
      audit({ audit_ref: "A3" }),
      audit({ audit_ref: "A2" }),
    ];

    expect(sortAudits(items, ascending).map((item) => item.audit_ref)).toEqual([
      "A1",
      "A2",
      "A3",
    ]);
    expect(sortAudits(items, descending).map((item) => item.audit_ref)).toEqual([
      "A3",
      "A2",
      "A1",
    ]);
  });
});

describe("nextAuditSort", () => {
  it("uses the natural direction when a new column is selected", () => {
    expect(nextAuditSort(DEFAULT_AUDIT_SORT, "title")).toEqual({
      key: "title",
      direction: "asc",
    });
    expect(nextAuditSort(DEFAULT_AUDIT_SORT, "overdue_action_count")).toEqual({
      key: "overdue_action_count",
      direction: "desc",
    });
  });

  it("toggles direction when the active column is selected again", () => {
    expect(
      nextAuditSort({ key: "title", direction: "asc" }, "title"),
    ).toEqual({ key: "title", direction: "desc" });
    expect(
      nextAuditSort({ key: "title", direction: "desc" }, "title"),
    ).toEqual({ key: "title", direction: "asc" });
  });
});

describe("summarizeAudits", () => {
  it("adds the counts the API returned for each visible audit", () => {
    const items = [
      audit({
        audit_ref: "A1",
        finding_count: 3,
        open_finding_count: 2,
        action_count: 4,
        overdue_action_count: 1,
      }),
      audit({
        audit_ref: "A2",
        finding_count: 5,
        open_finding_count: 0,
        action_count: 2,
        overdue_action_count: 2,
      }),
    ];

    expect(summarizeAudits(items)).toEqual({
      findings: 8,
      openFindings: 2,
      actions: 6,
      overdueActions: 3,
    });
  });

  it("returns zeroed totals for an empty register", () => {
    expect(summarizeAudits([])).toEqual({
      findings: 0,
      openFindings: 0,
      actions: 0,
      overdueActions: 0,
    });
  });
});
