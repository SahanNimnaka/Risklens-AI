import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      className={cx(
        "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={contentClassName ?? "p-5"}>{children}</div>
    </section>
  );
}
