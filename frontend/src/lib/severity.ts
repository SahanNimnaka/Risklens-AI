import type { AlertSeverity, FindingSeverity, RiskBand } from "../api/types";
import type { BadgeTone } from "../components/ui/Badge";

export const findingSeverityTones: Record<FindingSeverity, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "critical",
};

export const alertSeverityTones: Record<AlertSeverity, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "critical",
};

export const riskBandTones: Record<RiskBand, BadgeTone> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "critical",
};
