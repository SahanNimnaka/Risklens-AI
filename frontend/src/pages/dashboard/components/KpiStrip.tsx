import type { ReactNode } from "react";

import { cx } from "../../../lib/cx";

export interface KpiItem {
  key: string;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  badge?: ReactNode;
  loading: boolean;
  failed: boolean;
}

/**
 * The KPI row. Tiles are intentionally independent: one failed endpoint shows
 * "Unavailable" in its tile without hiding the other metrics.
 */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.key}
          aria-busy={item.loading}
          className={cx(
            "rounded-lg border bg-white p-4 shadow-sm",
            item.failed ? "border-red-200" : "border-slate-200",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {item.label}
            </p>
            <span className="text-slate-400" aria-hidden="true">
              {item.icon}
            </span>
          </div>

          {item.loading ? (
            <div className="mt-3 space-y-2" aria-hidden="true">
              <div className="h-7 w-20 rounded bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-3 w-28 rounded bg-slate-100 motion-safe:animate-pulse" />
            </div>
          ) : item.failed ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-slate-400">—</p>
              <p className="mt-1 text-xs text-red-700">Data unavailable</p>
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="text-2xl font-semibold tabular-nums text-slate-950">
                  {item.value}
                </p>
                {item.badge}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {item.detail}
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
