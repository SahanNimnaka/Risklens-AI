import {
  useCallback,
  useEffect,
  useState,
  type DependencyList,
} from "react";

import { ApiError } from "../api/client";

export interface ApiQueryResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Runs one read-only API request and exposes loading, error and retry state.
 *
 * The fetcher is intentionally not part of the dependency array: callers pass
 * explicit dependencies, the same way they would to `useEffect`. A new request
 * aborts the previous one, so stale responses cannot overwrite newer data.
 */
export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  dependencies: DependencyList,
): ApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    fetcher(controller.signal)
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((caught: unknown) => {
        if (!active) {
          return;
        }
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(
                "An unexpected error occurred while loading data.",
                0,
                caught,
              ),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, requestVersion]);

  const refetch = useCallback(() => {
    setRequestVersion((current) => current + 1);
  }, []);

  return { data, error, loading, refetch };
}
