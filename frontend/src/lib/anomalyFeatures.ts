import { formatDecimal, formatNumber, formatPercent } from "./format";

/**
 * Presentation-only formatting for the fixed anomaly feature set.
 *
 * The API returns raw feature values, peer medians and robust z-scores. These
 * helpers only choose a unit and precision; they never recalculate a deviation
 * or a score.
 */

const percentageFeatures = new Set([
  "high_critical_share",
  "overdue_action_rate",
  "weak_control_finding_share",
  "unactioned_finding_share",
  "resolved_share",
]);

const dayFeatures = new Set([
  "mean_days_overdue",
  "mean_remediation_window_days",
]);

const countFeatures = new Set([
  "finding_count",
  "critical_unresolved_count",
  "blocked_action_count",
]);

/** Keeps whole values compact, for example `93 days` rather than `93.0 days`. */
function formatDecimalCompact(value: number, fractionDigits: number): string {
  const formatted = formatDecimal(value, fractionDigits);
  return formatted.endsWith(".0")
    ? formatted.slice(0, -".0".length)
    : formatted;
}

export function formatAnomalyFeature(feature: string, value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (percentageFeatures.has(feature)) {
    return formatPercent(value * 100, 1);
  }

  if (dayFeatures.has(feature)) {
    return `${formatDecimalCompact(value, 1)} days`;
  }

  if (countFeatures.has(feature)) {
    return formatNumber(value);
  }

  return formatDecimal(value, 2);
}

/** Signed robust z-score for display; zero renders without a sign. */
export function formatSignedRobustZ(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) {
    return "0.00";
  }

  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}
