import type { RuleHit } from "../api/types";
import { formatDate, formatNumber } from "./format";
import {
  controlCategoryLabels,
  controlEffectivenessLabels,
  findingSeverityLabels,
  findingStatusLabels,
  rootCauseLabels,
} from "./labels";

/**
 * Presentation helpers for typed rule evidence.
 *
 * Evidence is returned by the risk engine as a small typed object per rule. The
 * helpers only label and format those values; they never invent or recompute
 * evidence. They are shared by the finding and action registers.
 */

const evidenceLabels: Record<string, string> = {
  action_id: "Action ID",
  due_date: "Due date",
  days_overdue: "Days overdue",
  completion_date: "Completion date",
  finding_severity: "Finding severity",
  severity_points: "Severity points",
  aging_multiplier: "Aging multiplier",
  identified_date: "Identified date",
  age_days: "Age (days)",
  status: "Finding status",
  sla_days: "SLA (days)",
  days_beyond_sla: "Days beyond SLA",
  window_start: "Window start",
  window_end: "Window end",
  root_cause_category: "Root cause",
  count: "Findings in cluster",
  finding_refs: "Finding references",
  control_ref: "Control reference",
  effectiveness: "Control effectiveness",
  category: "Control category",
  last_tested_date: "Last tested",
};

const enumLabels: Record<string, Record<string, string>> = {
  status: findingStatusLabels,
  finding_severity: findingSeverityLabels,
  root_cause_category: rootCauseLabels,
  effectiveness: controlEffectivenessLabels,
  category: controlCategoryLabels,
};

export interface EvidenceRow {
  key: string;
  label: string;
  value: string;
}

export function evidenceLabel(key: string): string {
  const known = evidenceLabels[key];
  if (known) {
    return known;
  }

  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Formats one evidence value by its key, preserving its original type. */
export function formatEvidenceValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "Not recorded";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(", ") : "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "—";
    }
    if (key.endsWith("_multiplier")) {
      return `×${value.toFixed(1)}`;
    }
    if (key.endsWith("_days")) {
      return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
    }
    if (key.endsWith("_points")) {
      return `${formatNumber(value)} pts`;
    }
    return formatNumber(value);
  }

  if (typeof value === "string") {
    if (key.endsWith("_date")) {
      return formatDate(value);
    }

    const translated = enumLabels[key]?.[value];
    if (translated) {
      return translated;
    }

    return value.replaceAll("_", " ");
  }

  return String(value);
}

/** Stable rows for a definition list; the API's evidence order is preserved. */
export function evidenceRows(evidence: Record<string, unknown>): EvidenceRow[] {
  return Object.entries(evidence).map(([key, value]) => ({
    key,
    label: evidenceLabel(key),
    value: formatEvidenceValue(key, value),
  }));
}

/** Selects one rule's hits without changing their API order. */
export function selectRuleHits(
  hits: readonly RuleHit[],
  ruleId: string,
): RuleHit[] {
  return hits.filter((hit) => hit.rule_id === ruleId);
}
