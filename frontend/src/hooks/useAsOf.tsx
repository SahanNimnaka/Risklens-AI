import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";

const FALLBACK_AS_OF = "2026-10-31";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict ISO calendar-date check.
 *
 * `new Date("2026-02-31")` silently rolls over to March, so the parsed parts
 * are compared back to the input instead of trusting `Date.parse`.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const configuredDefault = import.meta.env.VITE_DEFAULT_AS_OF?.trim();

export const DEFAULT_AS_OF =
  configuredDefault && isIsoDate(configuredDefault)
    ? configuredDefault
    : FALLBACK_AS_OF;

interface AsOfContextValue {
  asOf: string;
  isDefault: boolean;
  setAsOf: (value: string) => void;
  resetAsOf: () => void;
}

const AsOfContext = createContext<AsOfContextValue | null>(null);

export function AsOfProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get("as_of");
  const asOf = fromUrl && isIsoDate(fromUrl) ? fromUrl : DEFAULT_AS_OF;

  // A hand-edited or stale URL should not keep an invalid value that disagrees
  // with the date shown in the header. Remove it after the fallback renders.
  useEffect(() => {
    if (fromUrl && !isIsoDate(fromUrl)) {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("as_of");
          return next;
        },
        { replace: true },
      );
    }
  }, [fromUrl, setSearchParams]);

  const setAsOf = useCallback(
    (value: string) => {
      if (!isIsoDate(value)) {
        return;
      }

      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === DEFAULT_AS_OF) {
            next.delete("as_of");
          } else {
            next.set("as_of", value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetAsOf = useCallback(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("as_of");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const value = useMemo<AsOfContextValue>(
    () => ({
      asOf,
      isDefault: asOf === DEFAULT_AS_OF,
      setAsOf,
      resetAsOf,
    }),
    [asOf, resetAsOf, setAsOf],
  );

  return <AsOfContext.Provider value={value}>{children}</AsOfContext.Provider>;
}

export function useAsOf(): AsOfContextValue {
  const context = useContext(AsOfContext);
  if (!context) {
    throw new Error("useAsOf must be used inside an AsOfProvider.");
  }
  return context;
}
