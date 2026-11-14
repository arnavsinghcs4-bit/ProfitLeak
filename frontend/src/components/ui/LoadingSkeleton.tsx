import React from "react";
import clsx from "clsx";

interface SkeletonBlockProps {
  className?: string;
}

export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded bg-elevated/60",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex gap-4 px-3 py-2.5 border-b border-border-subtle/50">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={clsx("h-4 rounded", i === 0 ? "w-24" : i === cols - 1 ? "w-16" : "w-20")}
        />
      ))}
    </div>
  );
}

interface LoadingSkeletonProps {
  rows?: number;
  cols?: number;
}

export function LoadingSkeleton({ rows = 8, cols = 5 }: LoadingSkeletonProps) {
  return (
    <div role="status" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}
