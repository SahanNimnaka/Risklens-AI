import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "critical";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-orange-200 bg-orange-50 text-orange-900",
  critical: "border-red-200 bg-red-50 text-red-800",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-orange-500",
  critical: "bg-red-500",
};

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cx("h-1.5 w-1.5 rounded-full", dotClasses[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
