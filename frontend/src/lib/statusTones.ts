import type { ActionStatus, AuditStatus, FindingStatus } from "../api/types";
import type { BadgeTone } from "../components/ui/Badge";

/** Status tones are shared by badges and distribution bars. */
export const findingStatusTones: Record<FindingStatus, BadgeTone> = {
  open: "danger",
  in_progress: "warning",
  resolved: "success",
  accepted: "neutral",
};

export const actionStatusTones: Record<ActionStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "critical",
  completed: "success",
};

export const auditStatusTones: Record<AuditStatus, BadgeTone> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "neutral",
};
