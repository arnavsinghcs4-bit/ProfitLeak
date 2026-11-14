import React from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-t border-border-subtle text-xs">
      <span className="text-ink-faint font-mono tabular-nums">
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={clsx(
            "p-1.5 rounded transition-colors",
            page <= 1 ? "text-ink-faint cursor-not-allowed" : "text-ink-muted hover:text-ink hover:bg-elevated"
          )}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-ink-muted tabular-nums font-mono px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={clsx(
            "p-1.5 rounded transition-colors",
            page >= totalPages ? "text-ink-faint cursor-not-allowed" : "text-ink-muted hover:text-ink hover:bg-elevated"
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
