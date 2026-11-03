import { apiRequest } from "./client";
import type {
  ActionPlanListResponse,
  ActionStatus,
  Department,
} from "./types";

/** Optional filters supported by `GET /actions`. Empty strings are omitted. */
export interface ActionListFilters {
  status?: ActionStatus | "";
  department?: Department | "";
  overdue?: "" | "true" | "false";
  auditRef?: string;
  findingRef?: string;
  search?: string;
}

/**
 * Action plans attached to findings visible at the evaluation date.
 *
 * Overdue state and days overdue are computed by the API with the same rule as
 * R1, so the register never re-implements that comparison. Filtering stays on
 * the API; only ordering and presentation totals happen in the browser.
 */
export function fetchActions(
  asOf: string,
  signal?: AbortSignal,
  filters: ActionListFilters = {},
): Promise<ActionPlanListResponse> {
  return apiRequest<ActionPlanListResponse>("/actions", {
    signal,
    query: {
      as_of: asOf,
      status: filters.status || undefined,
      department: filters.department || undefined,
      overdue: filters.overdue || undefined,
      audit_ref: filters.auditRef?.trim() || undefined,
      finding_ref: filters.findingRef?.trim() || undefined,
      search: filters.search?.trim() || undefined,
    },
  });
}
