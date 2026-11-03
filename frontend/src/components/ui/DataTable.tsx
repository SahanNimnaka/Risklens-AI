import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

export type SortDirection = "asc" | "desc";

export interface DataTableSort {
  columnKey: string;
  direction: SortDirection;
  onSort: (columnKey: string) => void;
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  sort?: DataTableSort;
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
  sort,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => {
              const sorted =
                sort !== undefined && sort.columnKey === column.key;
              const ariaSort =
                sort && column.sortable
                  ? sorted
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                  : undefined;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cx(
                    "sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500",
                    alignClasses[column.align ?? "left"],
                    column.headerClassName,
                  )}
                >
                  {sort && column.sortable ? (
                    <button
                      type="button"
                      onClick={() => sort.onSort(column.key)}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-sm font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2",
                        (column.align ?? "left") === "right" && "justify-end",
                      )}
                    >
                      <span>{column.header}</span>
                      <span
                        aria-hidden="true"
                        className={cx(
                          "text-[10px]",
                          sorted ? "text-accent-600" : "text-slate-300",
                        )}
                      >
                        {sorted
                          ? sort.direction === "asc"
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
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
