import React from "react";
import clsx from "clsx";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  className?: string;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  keyFn,
  onRowClick,
  sortBy,
  sortDir,
  onSort,
  className,
  stickyHeader,
}: DataTableProps<T>) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className={clsx("border-b border-border-subtle", stickyHeader && "sticky top-0 bg-surface z-10")}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={clsx(
                  "px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint",
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                  col.sortable && onSort && "cursor-pointer select-none hover:text-ink-muted"
                )}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortBy === col.key && (
                    <span className="text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyFn(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                "border-b border-border-subtle/50 transition-colors",
                onRowClick && "cursor-pointer hover:bg-surface"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    "px-3 py-2.5 text-sm tabular-nums",
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
