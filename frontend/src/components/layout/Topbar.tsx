import { useLocation } from "react-router-dom";

import { fetchHealth } from "../../api/health";
import { useApiQuery } from "../../hooks/useApiQuery";
import { cx } from "../../lib/cx";
import { MenuIcon } from "../ui/icons";
import { AsOfControl } from "./AsOfControl";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/audits": "Audits",
  "/findings": "Risk findings",
  "/anomalies": "Anomalies",
  "/actions": "Action plans",
};

interface TopbarProps {
  navigationOpen: boolean;
  onOpenNavigation: () => void;
}

export function Topbar({ navigationOpen, onOpenNavigation }: TopbarProps) {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Page not found";
  const { error, loading } = useApiQuery((signal) => fetchHealth(signal), []);

  const statusLabel = loading
    ? "Checking API"
    : error
      ? "API unavailable"
      : "API connected";
  const statusTone = loading
    ? "bg-amber-400"
    : error
      ? "bg-red-500"
      : "bg-emerald-500";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          aria-expanded={navigationOpen}
          aria-controls="mobile-navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            RiskLens AI
          </p>
          <p className="truncate text-sm font-semibold text-slate-900">
            {pageTitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <AsOfControl />
          <div
            className="hidden h-8 w-px bg-slate-200 sm:block"
            aria-hidden="true"
          />
          <div
            role="status"
            aria-live="polite"
            title={error?.message}
            className="flex items-center gap-2 text-xs font-medium text-slate-600"
          >
            <span
              className={cx("h-2 w-2 rounded-full", statusTone)}
              aria-hidden="true"
            />
            <span className="hidden md:inline">{statusLabel}</span>
            <span className="sr-only md:hidden">{statusLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
