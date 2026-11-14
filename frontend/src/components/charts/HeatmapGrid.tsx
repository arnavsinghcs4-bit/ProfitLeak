import React, { useState } from "react";
import type { HeatmapCell } from "@/types/api";
import { fmtCurrency, fmtPct } from "@/lib/format";
import clsx from "clsx";

interface HeatmapGridProps {
  categories: string[];
  regions: string[];
  cells: HeatmapCell[];
  onCellClick?: (category: string, region: string) => void;
}

function marginColor(margin: number): string {
  // margin: -1 to 1
  // Negative → loss color (coral), zero → neutral, positive → gain color (green)
  if (margin < 0) {
    const intensity = Math.min(Math.abs(margin) / 0.5, 1);
    return `rgba(229, 101, 79, ${0.15 + intensity * 0.65})`;
  }
  const intensity = Math.min(margin / 0.5, 1);
  return `rgba(95, 184, 122, ${0.15 + intensity * 0.65})`;
}

function textColor(margin: number): string {
  return margin < 0 ? "#E5654F" : "#5FB87A";
}

export function HeatmapGrid({ categories, regions, cells, onCellClick }: HeatmapGridProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [metric, setMetric] = useState<"margin" | "profit">("margin");

  const cellMap = new Map<string, HeatmapCell>();
  cells.forEach((c) => cellMap.set(`${c.category}|${c.region}`, c));

  const allValues = cells.map((c) => (metric === "margin" ? c.profit_margin : c.net_profit));
  const absMax = Math.max(...allValues.map(Math.abs), 0.01);

  return (
    <div>
      <div className="flex justify-end gap-1 mb-4">
        {(["margin", "profit"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={[
              "px-2.5 py-1 text-2xs font-mono rounded border transition-colors",
              metric === m
                ? "bg-accent/20 border-accent/50 text-accent"
                : "border-border text-ink-faint hover:text-ink-muted",
            ].join(" ")}
          >
            {m === "margin" ? "Margin %" : "Net profit"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-ink-faint font-mono text-2xs w-32" />
              {regions.map((r) => (
                <th key={r} className="px-2 py-1.5 text-center text-ink-faint font-mono text-2xs whitespace-nowrap">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat}>
                <td className="px-2 py-1.5 text-ink-muted font-medium whitespace-nowrap pr-4">
                  {cat}
                </td>
                {regions.map((reg) => {
                  const key = `${cat}|${reg}`;
                  const cell = cellMap.get(key);
                  const val = cell
                    ? metric === "margin"
                      ? cell.profit_margin
                      : cell.net_profit
                    : null;
                  const hovered = hoveredCell === key;

                  return (
                    <td
                      key={reg}
                      className={clsx(
                        "px-2 py-2 text-center transition-all cursor-default",
                        cell && onCellClick && "cursor-pointer"
                      )}
                      style={cell ? { backgroundColor: marginColor(cell.profit_margin) } : { backgroundColor: "#1C211C" }}
                      onMouseEnter={() => cell && setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={cell && onCellClick ? () => onCellClick(cat, reg) : undefined}
                      title={
                        cell
                          ? `${cat} / ${reg}: Margin ${fmtPct(cell.profit_margin)}, Profit ${fmtCurrency(cell.net_profit)}, ${cell.orders} orders`
                          : "No data"
                      }
                    >
                      {cell ? (
                        <span
                          className="tabular-nums text-2xs font-mono font-medium"
                          style={{ color: textColor(cell.profit_margin) }}
                        >
                          {metric === "margin"
                            ? fmtPct(cell.profit_margin)
                            : fmtCurrency(cell.net_profit)}
                        </span>
                      ) : (
                        <span className="text-ink-faint text-2xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-3 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2 rounded" style={{ backgroundColor: "rgba(229, 101, 79, 0.75)" }} />
          <span className="text-2xs text-ink-faint font-mono">Loss</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2 rounded" style={{ backgroundColor: "rgba(95, 184, 122, 0.75)" }} />
          <span className="text-2xs text-ink-faint font-mono">Profitable</span>
        </div>
      </div>
    </div>
  );
}
