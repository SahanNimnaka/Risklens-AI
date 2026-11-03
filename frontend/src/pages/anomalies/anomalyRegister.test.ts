import { describe, expect, it } from "vitest";

import type { AuditAnomaly } from "../../api/types";
import {
  DEFAULT_ANOMALY_SORT,
  filterAnomalies,
  nextAnomalySort,
  sortAnomalies,
  summarizeAnomalies,
  type AnomalyFilters,
} from "./anomalyRegister";

function audit(overrides: Partial<AuditAnomaly> = {}): AuditAnomaly {
  return {
    audit_ref: "AUD-TEST-0001",
    audit_title: "Test audit",
    department: "it",
    anomaly_score: 0.4,
    score_percentile: 80,
    is_anomaly: false,
    rule_points: 0,
    rule_ids: [],
    features: {},
    deviations: [],
    ...overrides,
  };
}

const noFilters: AnomalyFilters = { department: "", flagged: "" };

describe("filterAnomalies", () => {
  const audits = [
    audit({ audit_ref: "AUD-1", department: "it", is_anomaly: true }),
    audit({ audit_ref: "AUD-2", department: "finance", is_anomaly: false }),
    audit({ audit_ref: "AUD-3", department: "it", is_anomaly: false }),
  ];

  it("returns every row when no filters are set", () => {
    expect(filterAnomalies(audits, noFilters).map((item) => item.audit_ref)).toEqual(
      ["AUD-1", "AUD-2", "AUD-3"],
    );
  });

  it("filters by department", () => {
    expect(
      filterAnomalies(audits, { department: "it", flagged: "" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-1", "AUD-3"]);
  });

  it("filters flagged and not-flagged rows", () => {
    expect(
      filterAnomalies(audits, { department: "", flagged: "true" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-1"]);
    expect(
      filterAnomalies(audits, { department: "", flagged: "false" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-2", "AUD-3"]);
  });

  it("combines department and flag filters", () => {
    expect(
      filterAnomalies(audits, { department: "it", flagged: "false" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-3"]);
  });
});

describe("sortAnomalies", () => {
  it("sorts scores descending by default without mutating the API array", () => {
    const audits = [
      audit({ audit_ref: "AUD-1", anomaly_score: 0.2 }),
      audit({ audit_ref: "AUD-2", anomaly_score: 0.7 }),
      audit({ audit_ref: "AUD-3", anomaly_score: 0.5 }),
    ];

    expect(
      sortAnomalies(audits, DEFAULT_ANOMALY_SORT).map((item) => item.audit_ref),
    ).toEqual(["AUD-2", "AUD-3", "AUD-1"]);
    expect(audits.map((item) => item.audit_ref)).toEqual([
      "AUD-1",
      "AUD-2",
      "AUD-3",
    ]);
  });

  it("sorts flags with flagged rows first when descending", () => {
    const audits = [
      audit({ audit_ref: "AUD-1", is_anomaly: false }),
      audit({ audit_ref: "AUD-2", is_anomaly: true }),
      audit({ audit_ref: "AUD-3", is_anomaly: false }),
    ];

    expect(
      sortAnomalies(audits, { key: "is_anomaly", direction: "desc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-2", "AUD-1", "AUD-3"]);
  });

  it("sorts audit references and departments ascending", () => {
    const audits = [
      audit({ audit_ref: "AUD-3", department: "operations" }),
      audit({ audit_ref: "AUD-1", department: "finance" }),
      audit({ audit_ref: "AUD-2", department: "it" }),
    ];

    expect(
      sortAnomalies(audits, { key: "audit_ref", direction: "asc" }).map(
        (item) => item.audit_ref,
      ),
    ).toEqual(["AUD-1", "AUD-2", "AUD-3"]);
    expect(
      sortAnomalies(audits, { key: "department", direction: "asc" }).map(
        (item) => item.department,
      ),
    ).toEqual(["finance", "it", "operations"]);
  });

  it("breaks ties by audit reference", () => {
    const audits = [
      audit({ audit_ref: "AUD-3", anomaly_score: 0.4 }),
      audit({ audit_ref: "AUD-1", anomaly_score: 0.4 }),
      audit({ audit_ref: "AUD-2", anomaly_score: 0.4 }),
    ];

    expect(
      sortAnomalies(audits, DEFAULT_ANOMALY_SORT).map((item) => item.audit_ref),
    ).toEqual(["AUD-1", "AUD-2", "AUD-3"]);
  });
});

describe("nextAnomalySort", () => {
  it("uses the natural direction for a new column", () => {
    expect(nextAnomalySort(DEFAULT_ANOMALY_SORT, "department")).toEqual({
      key: "department",
      direction: "asc",
    });
    expect(nextAnomalySort(DEFAULT_ANOMALY_SORT, "score_percentile")).toEqual({
      key: "score_percentile",
      direction: "desc",
    });
  });

  it("toggles direction when the active column is selected again", () => {
    expect(
      nextAnomalySort({ key: "anomaly_score", direction: "desc" }, "anomaly_score"),
    ).toEqual({ key: "anomaly_score", direction: "asc" });
  });
});

describe("summarizeAnomalies", () => {
  it("adds API-supplied flags, scores and rule points", () => {
    const audits = [
      audit({ is_anomaly: true, anomaly_score: 0.6, rule_points: 30 }),
      audit({ is_anomaly: true, anomaly_score: 0.5, rule_points: 10 }),
      audit({ is_anomaly: false, anomaly_score: 0.2, rule_points: 5 }),
    ];

    expect(summarizeAnomalies(audits)).toEqual({
      matching: 3,
      flagged: 2,
      highestScore: 0.6,
      rulePoints: 45,
    });
  });

  it("returns null for the highest score when no rows match", () => {
    expect(summarizeAnomalies([])).toEqual({
      matching: 0,
      flagged: 0,
      highestScore: null,
      rulePoints: 0,
    });
  });
});
