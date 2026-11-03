import type { FindingSeverity, RiskBand } from "../api/types";

/**
 * Chart colours mirror the badge tones so the same severity or band never
 * changes meaning between a chart and a label. SVG cannot use Tailwind class
 * names directly, so the hex values are kept in one place.
 */
export const severityChartColors: Record<FindingSeverity, string> = {
  low: "#94a3b8",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export const riskBandChartColors: Record<RiskBand, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export const chartAxisColor = "#64748b";
export const chartGridColor = "#e2e8f0";
