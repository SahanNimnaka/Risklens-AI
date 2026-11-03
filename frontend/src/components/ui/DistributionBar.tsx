import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import type { BadgeTone } from "./Badge";

export interface DistributionSegment {
  key: string;
  label: string;
  value: number;
  tone: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-orange-500",
  critical: "bg-red-500",
};

interface DistributionBarProps {
  segments: DistributionSegment[];
  total?: number;
  ariaLabel: string;
  className?: string;
}

/**
 * Compact stacked status bar with an always-visible text legend, so status is
 * never communicated by colour alone.
 */
export function DistributionBar({
  segments,
  total,
  ariaLabel,
  className,
}: DistributionBarProps) {
  const resolvedTotal =
    total ?? segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.key}
              className={cx("h-full", toneClasses[segment.tone])}
              style={{
                width: `${(segment.value / Math.max(resolvedTotal, 1)) * 100}%`,
              }}
            />
          ))}
      </div>
      <ul className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {segments.map((segment) => (
          <li
            key={segment.key}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className={cx(
                  "h-2 w-2 shrink-0 rounded-full",
                  toneClasses[segment.tone],
                )}
                aria-hidden="true"
              />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="font-medium tabular-nums text-slate-900">
              {formatNumber(segment.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
