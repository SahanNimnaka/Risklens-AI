import { apiRequest } from "./client";
import type { HealthResponse } from "./types";

export const API_HEALTH_REFRESH_EVENT = "risklens:api-health-refresh";

/** Shell-level connectivity check; it is not a business metric. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health", { signal });
}
