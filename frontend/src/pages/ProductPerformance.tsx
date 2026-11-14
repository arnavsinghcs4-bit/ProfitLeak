import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { getProducts, getBreakdown } from "@/lib/api";
import type { ProductRow, BreakdownRow } from "@/types/api";
import { fmtCurrency, fmtPct, fmtCount, fmtProfit } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Badge,
} from "@/components/ui";
import { FilterBar, FilterSelect, FilterInput } from "@/components/ui/FilterBar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

type SortKey = "net_profit" | "net_revenue" | "gross_sales" | "profit_margin" | "orders" | "loss_orders";

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

const ProductTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ProductRow;
  return (
    <div className="bg-elevated border border-border rounded px-3 py-2.5 text-xs shadow-xl max-w-xs">
      <p className="text-ink font-medium mb-1.5 truncate">{d.product_name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-ink-faint">Net profit</span>
        <span className={clsx("tabular-nums", d.net_profit < 0 ? "text-loss" : "text-gain")}>{fmtProfit(d.net_profit)}</span>
        <span className="text-ink-faint">Gross sales</span>
        <span className="tabular-nums text-ink">{fmtCurrency(d.gross_sales)}</span>
        <span className="text-ink-faint">Margin</span>
        <span className={clsx("tabular-nums", d.profit_margin < 0 ? "text-loss" : "text-gain")}>{fmtPct(d.profit_margin)}</span>
        <span className="text-ink-faint">Orders</span>
        <span className="tabular-nums text-ink">{fmtCount(d.orders)}</span>
      </div>
    </div>
  );
};

export default function ProductPerformance() {
  const { sessionId, meta } = useSession();
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [breakdown, setBreakdown] = useState<BreakdownRow[] | null>(null);
  const [breakdownDim, setBreakdownDim] = useState<"category" | "sub_category" | "region" | "segment">("category");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("net_profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  const analyzed = meta?.status === "analyzed";

  const fetchProducts = useCallback(async () => {
    if (!sessionId || !analyzed) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getProducts(sessionId, {
        search,
        category: category || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        limit: 200,
      });
      setProducts(r.rows);
      setTotalProducts(r.total_products);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, analyzed, search, category, sortBy, sortDir]);

  const fetchBreakdown = useCallback(async () => {
    if (!sessionId || !analyzed) return;
    setLoadingBreakdown(true);
    try {
      const r = await getBreakdown(sessionId, breakdownDim);
      setBreakdown(r.rows);
    } catch {
      setBreakdown(null);
    } finally {
      setLoadingBreakdown(false);
    }
  }, [sessionId, analyzed, breakdownDim]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 300);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  useEffect(() => { fetchBreakdown(); }, [fetchBreakdown]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  if (!sessionId || !meta) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Product Performance" />
        <EmptyState title="No dataset loaded" action={<button onClick={() => navigate("/data")} className="text-xs text-accent hover:underline">Go to Data Sources</button>} />
      </div>
    );
  }
  if (!analyzed) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Product Performance" />
        <EmptyState title="Analysis not run" description="Run the analysis from the Overview page." />
      </div>
    );
  }

  // Top/bottom 10 for chart
  const top10 = (products ?? []).slice(0, 10);
  const bottom10 = [...(products ?? [])].sort((a, b) => a.net_profit - b.net_profit).slice(0, 10);

  return (
    <div className="px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Product Performance"
        description="Compare products and categories by total profit, margin, and contribution. High-margin products are not always high-contribution."
      />

      {/* Dimension breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Breakdown by dimension */}
        <SectionCard>
          <SectionHeader
            title="Profitability by dimension"
            actions={
              <div className="flex gap-1">
                {(["category", "sub_category", "region", "segment"] as const).map((dim) => (
                  <button
                    key={dim}
                    onClick={() => setBreakdownDim(dim)}
                    className={[
                      "px-2 py-1 text-2xs font-mono rounded border transition-colors",
                      breakdownDim === dim
                        ? "bg-accent/20 border-accent/50 text-accent"
                        : "border-border text-ink-faint hover:text-ink-muted",
                    ].join(" ")}
                  >
                    {dim.replace("_", " ")}
                  </button>
                ))}
              </div>
            }
          />
          {loadingBreakdown ? (
            <LoadingSkeleton rows={5} cols={4} />
          ) : breakdown && breakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle">
                    {["Name", "Orders", "Net Revenue", "Net Profit", "Margin"].map((h) => (
                      <th key={h} className={clsx("px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint", h !== "Name" ? "text-right" : "text-left")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.name} className="border-b border-border-subtle/50 hover:bg-elevated/30">
                      <td className="px-3 py-2.5 text-ink-muted font-medium">{row.name}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-ink-faint">{fmtCount(row.orders)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(row.net_revenue)}</td>
                      <td className={clsx("px-3 py-2.5 tabular-nums text-right font-medium", row.net_profit < 0 ? "text-loss" : "text-gain")}>{fmtProfit(row.net_profit)}</td>
                      <td className={clsx("px-3 py-2.5 tabular-nums text-right", row.profit_margin < 0 ? "text-loss" : "text-gain")}>{fmtPct(row.profit_margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No breakdown data" description={`The dataset does not contain a '${breakdownDim.replace("_", " ")}' column.`} />
          )}
        </SectionCard>

        {/* Top 10 by profit chart */}
        <SectionCard>
          <SectionHeader title="Top 10 products by net profit" />
          {top10.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: "#6B736A", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#2B312B" }} tickFormatter={(v) => fmtCurrency(v)} />
                <YAxis type="category" dataKey="product_name" tick={{ fill: "#969D93", fontSize: 9 }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<ProductTooltip />} />
                <Bar dataKey="net_profit" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {top10.map((p) => <Cell key={p.product_name} fill="#5FB87A" fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No product data" description="Add a product_name column to enable product-level analysis." />
          )}
        </SectionCard>
      </div>

      {/* Bottom 10 by profit */}
      {bottom10.some(p => p.net_profit < 0) && (
        <SectionCard>
          <SectionHeader title="Bottom 10 products by net profit" description="Largest loss contributors." />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bottom10} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#6B736A", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#2B312B" }} tickFormatter={(v) => fmtCurrency(v)} />
              <YAxis type="category" dataKey="product_name" tick={{ fill: "#969D93", fontSize: 9 }} tickLine={false} axisLine={false} width={120} />
              <Tooltip content={<ProductTooltip />} />
              <Bar dataKey="net_profit" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {bottom10.map((p) => <Cell key={p.product_name} fill={p.net_profit < 0 ? "#E5654F" : "#5FB87A"} fillOpacity={0.75} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Product table */}
      <SectionCard>
        <SectionHeader
          title="All products"
          description={`${totalProducts.toLocaleString()} products · sorted by ${sortBy.replace("_", " ")}`}
        />
        <FilterBar hasActiveFilters={!!(search || category)} onReset={() => { setSearch(""); setCategory(""); }}>
          <FilterInput value={search} onChange={(v) => setSearch(v)} placeholder="Search product name…" />
        </FilterBar>

        {error && <ErrorState message={error} retry={fetchProducts} />}
        {loading ? (
          <LoadingSkeleton rows={8} cols={7} />
        ) : products && products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-subtle">
                  {[
                    { key: "product_name" as SortKey, label: "Product", align: "left", sortable: false },
                    { key: "orders" as SortKey, label: "Orders", align: "right", sortable: true },
                    { key: "gross_sales" as SortKey, label: "Gross Sales", align: "right", sortable: true },
                    { key: "net_revenue" as SortKey, label: "Net Revenue", align: "right", sortable: true },
                    { key: "net_profit" as SortKey, label: "Net Profit", align: "right", sortable: true },
                    { key: "profit_margin" as SortKey, label: "Margin", align: "right", sortable: true },
                    { key: "loss_orders" as SortKey, label: "Loss Orders", align: "right", sortable: true },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      className={clsx(
                        "px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint whitespace-nowrap",
                        col.align === "right" ? "text-right" : "text-left",
                        col.sortable && "cursor-pointer hover:text-ink-muted select-none"
                      )}
                    >
                      {col.label}
                      {col.sortable && sortBy === col.key && <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_name} className="border-b border-border-subtle/40 hover:bg-elevated/30">
                    <td className="px-3 py-2.5 text-ink-muted max-w-[200px] truncate">{p.product_name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-ink-faint">{fmtCount(p.orders)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(p.gross_sales)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(p.net_revenue)}</td>
                    <td className={clsx("px-3 py-2.5 tabular-nums text-right font-medium", p.net_profit < 0 ? "text-loss" : "text-gain")}>{fmtProfit(p.net_profit)}</td>
                    <td className={clsx("px-3 py-2.5 tabular-nums text-right", p.profit_margin < 0 ? "text-loss" : "text-gain")}>{fmtPct(p.profit_margin)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-loss">{fmtCount(p.loss_orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No product data" description="Add a product_name column to your dataset to enable product-level analysis." />
        )}
      </SectionCard>
    </div>
  );
}
