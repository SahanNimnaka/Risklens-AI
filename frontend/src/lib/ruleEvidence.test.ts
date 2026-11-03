import { describe, expect, it } from "vitest";

import type { RuleHit } from "../api/types";
import {
  evidenceLabel,
  evidenceRows,
  formatEvidenceValue,
  selectRuleHits,
} from "./ruleEvidence";

function hit(overrides: Partial<RuleHit> = {}): RuleHit {
  return {
    rule_id: "R2_unresolved_critical",
    rule_name: "Unresolved critical finding",
    severity: "critical",
    points: 20,
    entity_type: "finding",
    entity_ref: "finding:FND-TEST-0001",
    department: "finance",
    finding_ref: "FND-TEST-0001",
    control_ref: null,
    audit_ref: "AUD-TEST-0001",
    reason: "Critical finding has been open.",
    evidence: {},
    ...overrides,
  };
}

describe("evidenceLabel", () => {
  it("uses a human label for known evidence keys", () => {
    expect(evidenceLabel("days_overdue")).toBe("Days overdue");
    expect(evidenceLabel("root_cause_category")).toBe("Root cause");
    expect(evidenceLabel("finding_refs")).toBe("Finding references");
  });

  it("falls back to a spaced and capitalised key", () => {
    expect(evidenceLabel("unexpected_field")).toBe("Unexpected field");
  });
});

describe("formatEvidenceValue", () => {
  it("formats dates without shifting them across time zones", () => {
    expect(formatEvidenceValue("identified_date", "2026-10-31")).toBe(
      "31 Oct 2026",
    );
    expect(formatEvidenceValue("last_tested_date", null)).toBe("Not recorded");
  });

  it("adds units to day, point and multiplier values", () => {
    expect(formatEvidenceValue("age_days", 45)).toBe("45 days");
    expect(formatEvidenceValue("age_days", 1)).toBe("1 day");
    expect(formatEvidenceValue("severity_points", 1200)).toBe("1,200 pts");
    expect(formatEvidenceValue("aging_multiplier", 1.5)).toBe("×1.5");
  });

  it("translates controlled vocabulary values", () => {
    expect(formatEvidenceValue("status", "in_progress")).toBe("In progress");
    expect(formatEvidenceValue("finding_severity", "critical")).toBe(
      "Critical",
    );
    expect(formatEvidenceValue("root_cause_category", "process_gap")).toBe(
      "Process gap",
    );
    expect(formatEvidenceValue("effectiveness", "partially_effective")).toBe(
      "Partially effective",
    );
  });

  it("renders arrays, booleans and nulls as typed values", () => {
    expect(
      formatEvidenceValue("finding_refs", ["FND-1", "FND-2"]),
    ).toBe("FND-1, FND-2");
    expect(formatEvidenceValue("finding_refs", [])).toBe("None");
    expect(formatEvidenceValue("included", true)).toBe("Yes");
    expect(formatEvidenceValue("included", false)).toBe("No");
    expect(formatEvidenceValue("completion_date", null)).toBe("Not recorded");
  });

  it("falls back to spaced text for unknown string values", () => {
    expect(formatEvidenceValue("category", "vendor_management")).toBe(
      "Vendor management",
    );
    expect(formatEvidenceValue("unknown", "some_value")).toBe("some value");
  });
});

describe("evidenceRows", () => {
  it("preserves the API evidence order and labels every value", () => {
    const rows = evidenceRows({
      identified_date: "2026-01-05",
      age_days: 30,
      status: "open",
    });

    expect(rows).toEqual([
      { key: "identified_date", label: "Identified date", value: "05 Jan 2026" },
      { key: "age_days", label: "Age (days)", value: "30 days" },
      { key: "status", label: "Finding status", value: "Open" },
    ]);
  });
});

describe("selectRuleHits", () => {
  it("selects one rule's hits without changing their order", () => {
    const hits = [
      hit({ rule_id: "R4_repeated_findings", entity_ref: "department:finance" }),
      hit({ rule_id: "R6_weak_control", entity_ref: "control:CTL-1" }),
      hit({ rule_id: "R6_weak_control", entity_ref: "control:CTL-2" }),
    ];

    expect(
      selectRuleHits(hits, "R6_weak_control").map((item) => item.entity_ref),
    ).toEqual(["control:CTL-1", "control:CTL-2"]);
  });

  it("returns an empty list when the rule has no hits", () => {
    expect(selectRuleHits([hit()], "R6_weak_control")).toEqual([]);
  });
});
