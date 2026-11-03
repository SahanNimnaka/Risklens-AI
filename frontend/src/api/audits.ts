import { apiRequest } from "./client";
import type {
  AuditListResponse,
  AuditStatus,
  AuditType,
  Department,
} from "./types";

/** Optional filters supported by `GET /audits`. Empty strings are omitted. */
export interface AuditListFilters {
  department?: Department | "";
  status?: AuditStatus | "";
  auditType?: AuditType | "";
  search?: string;
}

/**
 * Audits that started on or before the requested evaluation date.
 *
 * Filtering is performed by the API so the register never derives its own
 * status, department or text matches from an unfiltered response.
 */
export function fetchAudits(
  asOf: string,
  signal?: AbortSignal,
  filters: AuditListFilters = {},
): Promise<AuditListResponse> {
  return apiRequest<AuditListResponse>("/audits", {
    signal,
    query: {
      as_of: asOf,
      department: filters.department || undefined,
      status: filters.status || undefined,
      audit_type: filters.auditType || undefined,
      search: filters.search?.trim() || undefined,
    },
  });
}
