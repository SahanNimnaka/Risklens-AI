import { useCallback, useRef } from "react";
import { useSearchParams, type NavigateOptions } from "react-router-dom";

import { mergeSearchParams, type LinkQuery } from "../lib/links";

export function createSearchParamsUpdater(initial: URLSearchParams) {
  let latest = new URLSearchParams(initial);
  let pendingSearch: string | null = null;

  return {
    sync(observed: URLSearchParams) {
      const search = observed.toString();
      if (pendingSearch === search) {
        pendingSearch = null;
        latest = new URLSearchParams(observed);
      } else if (pendingSearch === null) {
        latest = new URLSearchParams(observed);
      }
    },
    update(updates: LinkQuery) {
      latest = mergeSearchParams(latest, updates);
      pendingSearch = latest.toString();
      return new URLSearchParams(latest);
    },
  };
}

/**
 * URL search parameters plus a merge-based updater.
 *
 * React Router does not queue multiple `setSearchParams` functional updates in
 * one tick. Keep an accumulated copy so rapid filter changes each build on the
 * preceding update, then resync it when the navigation reaches the URL.
 */
export function useUrlSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const updaterRef = useRef<ReturnType<typeof createSearchParamsUpdater> | null>(
    null,
  );
  if (!updaterRef.current) {
    updaterRef.current = createSearchParamsUpdater(searchParams);
  }
  const updater = updaterRef.current;
  updater.sync(searchParams);

  const update = useCallback(
    (updates: LinkQuery, options?: NavigateOptions) => {
      setSearchParams(updater.update(updates), options);
    },
    [setSearchParams, updater],
  );

  return [searchParams, update] as const;
}
