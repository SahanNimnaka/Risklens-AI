import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
}

const alignClasses: Record<"left" | "center" | "right", string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "No records found.",
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  "sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500",
                  alignClasses[column.align ?? "left"],
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const interactive = Boolean(onRowClick);

              return (
                <tr
                  key={rowKey(row)}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  className={cx(
                    "transition-colors",
                    interactive &&
                      "cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cx(
                        "px-4 py-3 align-top text-slate-700",
                        alignClasses[column.align ?? "left"],
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
