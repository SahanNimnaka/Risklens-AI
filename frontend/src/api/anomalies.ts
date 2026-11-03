import { apiRequest } from "./client";
import type { AnomalyListResponse, AuditAnomalyDetail } from "./types";

/** Advisory peer-relative anomaly ranking for eligible audits. */
export function fetchAnomalyAudits(
  asOf: string,
  signal?: AbortSignal,
): Promise<AnomalyListResponse> {
  return apiRequest<AnomalyListResponse>("/anomalies/audits", {
    signal,
    query: { as_of: asOf },
  });
}

/**
 * One audit with every feature deviation.
 *
 * The list response includes only the three largest deviations. The detail
 * response supplies all 11 for the drawer, still ordered by absolute robust
 * z-score and never recalculated in the browser.
 */
export function fetchAnomalyAudit(
  auditRef: string,
  asOf: string,
  signal?: AbortSignal,
): Promise<AuditAnomalyDetail> {
  return apiRequest<AuditAnomalyDetail>(
    `/anomalies/audits/${encodeURIComponent(auditRef)}`,
    { signal, query: { as_of: asOf } },
  );
}
