import { apiRequest } from "./client";
import type {
  Department,
  FindingListResponse,
  FindingRisk,
  FindingSeverity,
  FindingStatus,
} from "./types";

/** Optional filters supported by `GET /findings`. Empty strings are omitted. */
export interface FindingListFilters {
  severity?: FindingSeverity | "";
  status?: FindingStatus | "";
  department?: Department | "";
  auditRef?: string;
  ruleId?: string;
  search?: string;
}

/**
 * Findings identified on or before the requested evaluation date.
 *
 * Filtering is performed by the API so the register never derives its own
 * severity, status, department, rule or text matches from an unfiltered list.
 */
export function fetchFindings(
  asOf: string,
  signal?: AbortSignal,
  filters: FindingListFilters = {},
): Promise<FindingListResponse> {
  return apiRequest<FindingListResponse>("/findings", {
    signal,
    query: {
      as_of: asOf,
      severity: filters.severity || undefined,
      status: filters.status || undefined,
      department: filters.department || undefined,
      audit_ref: filters.auditRef?.trim() || undefined,
      rule_id: filters.ruleId?.trim() || undefined,
      search: filters.search?.trim() || undefined,
    },
  });
}

/**
 * One finding's direct rule hits and related department recurrence clusters.
 *
 * The API computes the score. The frontend only displays it and must not add
 * the related R4 cluster points to the finding's direct score.
 */
export function fetchFindingRisk(
  findingRef: string,
  asOf: string,
  signal?: AbortSignal,
): Promise<FindingRisk> {
  return apiRequest<FindingRisk>(
    `/risk/findings/${encodeURIComponent(findingRef)}`,
    {
      signal,
      query: { as_of: asOf },
    },
  );
}
