import React from "react";
import clsx from "clsx";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "loss" | "gain" | "warn";
  tooltip?: string;
  size?: "sm" | "md" | "lg";
}

export function MetricCard({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
}: MetricCardProps) {
  const valueClass = clsx(
    "font-semibold tabular-nums leading-none",
    {
      sm: "text-xl",
      md: "text-2xl",
      lg: "text-3xl",
    }[size],
    {
      default: "text-ink",
      loss: "text-loss",
      gain: "text-gain",
      warn: "text-warn",
    }[tone]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-ink-faint uppercase tracking-widest font-mono">{label}</p>
      <p className={valueClass}>{value}</p>
      {sub && <p className="text-xs text-ink-muted leading-snug">{sub}</p>}
    </div>
  );
}
