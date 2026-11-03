import { describe, expect, it } from "vitest";

import {
  formatAnomalyFeature,
  formatSignedRobustZ,
} from "./anomalyFeatures";

describe("formatAnomalyFeature", () => {
  it("formats count features as whole numbers", () => {
    expect(formatAnomalyFeature("finding_count", 4)).toBe("4");
    expect(formatAnomalyFeature("critical_unresolved_count", 12)).toBe("12");
    expect(formatAnomalyFeature("blocked_action_count", 3)).toBe("3");
  });

  it("formats share and rate features as percentages", () => {
    expect(formatAnomalyFeature("high_critical_share", 0.75)).toBe("75.0%");
    expect(formatAnomalyFeature("overdue_action_rate", 0.325)).toBe("32.5%");
    expect(formatAnomalyFeature("resolved_share", 1)).toBe("100.0%");
  });

  it("formats day features with a unit and compact whole values", () => {
    expect(formatAnomalyFeature("mean_days_overdue", 39.25)).toBe("39.3 days");
    expect(formatAnomalyFeature("mean_remediation_window_days", 93)).toBe(
      "93 days",
    );
  });

  it("formats diversity and unknown features as decimals", () => {
    expect(formatAnomalyFeature("root_cause_diversity", 0.5)).toBe("0.50");
    expect(formatAnomalyFeature("unexpected_feature", 1.234)).toBe("1.23");
  });

  it("renders non-finite values as an em dash", () => {
    expect(formatAnomalyFeature("finding_count", Number.NaN)).toBe("—");
    expect(formatAnomalyFeature("mean_days_overdue", Number.POSITIVE_INFINITY)).toBe(
      "—",
    );
  });
});

describe("formatSignedRobustZ", () => {
  it("adds an explicit sign to non-zero deviations", () => {
    expect(formatSignedRobustZ(3.7258)).toBe("+3.73");
    expect(formatSignedRobustZ(-2.5631)).toBe("-2.56");
  });

  it("renders zero and near-zero deviations without a sign", () => {
    expect(formatSignedRobustZ(0)).toBe("0.00");
    expect(formatSignedRobustZ(-0.001)).toBe("0.00");
  });

  it("renders non-finite values as an em dash", () => {
    expect(formatSignedRobustZ(Number.NaN)).toBe("—");
  });
});
