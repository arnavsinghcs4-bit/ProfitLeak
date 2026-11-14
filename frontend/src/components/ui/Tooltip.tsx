import React, { useState, useRef } from "react";
import clsx from "clsx";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: "top" | "bottom";
}

export function Tooltip({ content, children, placement = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={clsx(
            "absolute z-50 w-56 rounded border border-border bg-elevated px-2.5 py-2",
            "text-xs text-ink-muted shadow-lg pointer-events-none",
            placement === "top"
              ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2"
              : "top-full mt-1.5 left-1/2 -translate-x-1/2"
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
