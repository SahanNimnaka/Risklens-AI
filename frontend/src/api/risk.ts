import { apiRequest } from "./client";
import type {
  Department,
  DepartmentRiskDetail,
  PortfolioSummary,
} from "./types";

/** Deterministic portfolio score, rule breakdown and department ranking. */
export function fetchPortfolioSummary(
  asOf: string,
  signal?: AbortSignal,
): Promise<PortfolioSummary> {
  return apiRequest<PortfolioSummary>("/risk/summary", {
    signal,
    query: { as_of: asOf },
  });
}

/** One department's score, rule breakdown and every attributed rule hit. */
export function fetchDepartmentRisk(
  department: Department,
  asOf: string,
  signal?: AbortSignal,
): Promise<DepartmentRiskDetail> {
  return apiRequest<DepartmentRiskDetail>(
    `/risk/departments/${encodeURIComponent(department)}`,
    {
      signal,
      query: { as_of: asOf },
    },
  );
}
