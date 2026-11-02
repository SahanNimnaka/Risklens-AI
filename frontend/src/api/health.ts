import { apiRequest } from "./client";
import type { HealthResponse } from "./types";

/** Shell-level connectivity check; it is not a business metric. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health", { signal });
}
