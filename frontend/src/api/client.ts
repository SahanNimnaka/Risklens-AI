/**
 * Minimal read-only HTTP client.
 *
 * The base URL is public configuration (`VITE_API_BASE_URL`) and defaults to
 * `/api`, which the Vite dev proxy forwards to FastAPI. No secret or database
 * credential is ever part of the frontend bundle.
 */

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configuredBase || "/api").replace(/\/+$/, "");

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  signal?: AbortSignal;
  query?: Record<string, QueryValue>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status = 0, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const queryString = search.toString();
  return `${API_BASE_URL}${normalizedPath}${queryString ? `?${queryString}` : ""}`;
}

function validationMessage(item: unknown): string | null {
  if (!item || typeof item !== "object" || !("msg" in item)) {
    return null;
  }
  const message = (item as { msg?: unknown }).msg;
  return typeof message === "string" ? message : null;
}

function errorMessage(detail: unknown, status: number): string {
  if (detail && typeof detail === "object" && "detail" in detail) {
    const payload = (detail as { detail: unknown }).detail;

    if (typeof payload === "string") {
      return payload;
    }

    if (Array.isArray(payload)) {
      const messages = payload
        .map(validationMessage)
        .filter((message): message is string => message !== null);
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }

  if (status === 404) {
    return "The requested record was not found.";
  }
  if (status === 422) {
    return "The request contained an invalid parameter.";
  }
  return `The API returned an unexpected response (${status}).`;
}

async function readErrorDetail(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      "Unable to reach the RiskLens API. Check that the backend is running and the proxy target is correct.",
      0,
      error,
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new ApiError(errorMessage(detail, response.status), response.status, detail);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError(
      "The API returned a response that could not be read as JSON.",
      response.status,
      error,
    );
  }
}
