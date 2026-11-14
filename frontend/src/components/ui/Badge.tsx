import React from "react";
import clsx from "clsx";

type BadgeTone = "default" | "loss" | "gain" | "warn" | "info";

const tones: Record<BadgeTone, string> = {
  default: "text-ink-muted border-border bg-elevated/60",
  loss: "text-loss border-loss/30 bg-loss/10",
  gain: "text-gain border-gain/30 bg-gain/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  info: "text-accent border-accent/30 bg-accent/10",
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-mono leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function lossCauseTone(cause: string): BadgeTone {
  switch (cause) {
    case "Both": return "loss";
    case "Discount-driven": return "warn";
    case "Shipping-driven": return "warn";
    case "Cost-driven": return "info";
    case "Profitable": return "gain";
    default: return "default";
  }
}
