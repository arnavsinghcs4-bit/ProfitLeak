import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import {
  getLossOrders,
  getLossCauses,
  getFilterOptions,
  getOrderDetail,
  exportLossOrdersUrl,
} from "@/lib/api";
import type {
  LossOrderRow,
  LossOrdersResponse,
  FilterOptionsResponse,
  OrderDetailResponse,
} from "@/types/api";
import { fmtCurrency, fmtPct, fmtProfit, fmtCount, fmtDate } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Pagination,
  Badge,
  Drawer,
} from "@/components/ui";
import { lossCauseTone } from "@/components/ui/Badge";
import { FilterBar, FilterSelect, FilterInput } from "@/components/ui/FilterBar";
import { Download, Search, X, Loader2 } from "lucide-react";

const PAGE_SIZE = 50;

function OrderDetailDrawer({
  open,
  onClose,
  sessionId,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  orderId: string;
}) {
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    setError(null);
    getOrderDetail(sessionId, orderId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, sessionId, orderId]);

  const order = detail?.order;
  const defs = detail?.metric_definitions ?? {};

  function row(label: string, value: React.ReactNode, def?: string) {
    return (
      <div key={label} className="py-2 border-b border-border-subtle/50 last:border-0">
        <div className="flex justify-between items-start gap-4">
          <span className="text-xs text-ink-faint">{label}</span>
          <span className="text-xs text-right text-ink tabular-nums font-medium">{value ?? "—"}</span>
        </div>
        {def && <p className="text-2xs text-ink-faint mt-0.5 leading-snug">{def}</p>}
      </div>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={`Order ${orderId}`}>
      {loading && <LoadingSkeleton rows={10} cols={2} />}
      {error && <ErrorState message={error} />}
      {order && (
        <div className="space-y-4">
          <section>
            <p className="text-2xs font-mono uppercase tracking-widest text-ink-faint mb-2">Order information</p>
            {row("Order ID", <span className="font-mono">{String(order.order_id ?? "—")}</span>)}
            {row("Order date", String(order.order_date ?? "—"))}
            {row("Ship date", String(order.ship_date ?? "—"))}
            {row("Segment", String(order.segment ?? "—"))}
            {row("Region", String(order.region ?? "—"))}
            {row("Category", String(order.category ?? "—"))}
            {row("Sub-category", String(order.sub_category ?? "—"))}
            {row("Product", String(order.product_name ?? "—"))}
            {row("Quantity", String(order.quantity ?? "—"))}
            {row("Discount band", String(order.discount_band ?? "—"))}
          </section>

          <section>
            <p className="text-2xs font-mono uppercase tracking-widest text-ink-faint mb-2">Financial metrics</p>
            {row("Gross sales", fmtCurrency(order.gross_sales as number, 2), defs.gross_sales)}
            {row("Discount", fmtPct(order.discount as number), undefined)}
            {row("Discount amount", fmtCurrency(order.discount_amount as number, 2), defs.discount_amount)}
            {row("Net revenue", fmtCurrency(order.net_revenue as number, 2), defs.net_revenue)}
            {row("COGS", fmtCurrency(order.cogs as number, 2), defs.cogs)}
            {row("Shipping cost", fmtCurrency(order.shipping_cost as number, 2), defs.shipping_cost)}
            {order.payment_fee != null && order.payment_fee !== 0 &&
              row("Payment fee", fmtCurrency(order.payment_fee as number, 2), defs.payment_fee)}
            <div className={["py-2 border-b border-border-subtle/50", (order.net_profit as number) < 0 ? "bg-loss/5 rounded" : ""].join(" ")}>
              <div className="flex justify-between items-start gap-4">
                <span className="text-xs font-semibold text-ink">Net profit</span>
                <span className={["text-xs font-bold tabular-nums", (order.net_profit as number) < 0 ? "text-loss" : "text-gain"].join(" ")}>
                  {fmtProfit(order.net_profit as number)}
                </span>
              </div>
              <p className="text-2xs text-ink-faint mt-0.5">{defs.net_profit}</p>
            </div>
            {row("Profit margin", fmtPct(order.profit_margin as number), defs.profit_margin)}
          </section>

          <section>
            <p className="text-2xs font-mono uppercase tracking-widest text-ink-faint mb-2">Loss diagnosis</p>
            <div className="flex items-center gap-2 py-2">
              <span className="text-xs text-ink-faint">Loss cause</span>
              <Badge tone={lossCauseTone(String(order.loss_cause ?? ""))}>
                {String(order.loss_cause ?? "—")}
              </Badge>
            </div>
            <p className="text-2xs text-ink-faint leading-relaxed mt-1">{defs.loss_cause}</p>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export default function LossExplorer() {
  const { sessionId, meta } = useSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state (initialize from URL params)
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [subCategory, setSubCategory] = useState(searchParams.get("sub_category") ?? "");
  const [region, setRegion] = useState(searchParams.get("region") ?? "");
  const [segment, setSegment] = useState(searchParams.get("segment") ?? "");
  const [lossCause, setLossCause] = useState(searchParams.get("loss_cause") ?? "");
  const [discountMin, setDiscountMin] = useState(searchParams.get("discount_min") ?? "");
  const [discountMax, setDiscountMax] = useState(searchParams.get("discount_max") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "");
  const [sortBy, setSortBy] = useState("net_profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<LossOrdersResponse | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasFilters = !!(search || category || subCategory || region || segment || lossCause || discountMin || discountMax || dateFrom || dateTo);

  const analyzed = meta?.status === "analyzed";

  // Load filter options once
  useEffect(() => {
    if (!sessionId || !analyzed) return;
    getFilterOptions(sessionId).then(setFilterOptions).catch(() => {});
  }, [sessionId, analyzed]);

  const fetch = useCallback(async () => {
    if (!sessionId || !analyzed) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getLossOrders(sessionId, {
        search,
        category: category || undefined,
        sub_category: subCategory || undefined,
        region: region || undefined,
        segment: segment || undefined,
        loss_cause: lossCause || undefined,
        discount_min: discountMin ? parseFloat(discountMin) : undefined,
        discount_max: discountMax ? parseFloat(discountMax) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: PAGE_SIZE,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, analyzed, search, category, subCategory, region, segment, lossCause, discountMin, discountMax, dateFrom, dateTo, sortBy, sortDir, page]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(fetch, 300);
    return () => clearTimeout(timer);
  }, [fetch]);

  const resetFilters = () => {
    setSearch(""); setCategory(""); setSubCategory(""); setRegion("");
    setSegment(""); setLossCause(""); setDiscountMin(""); setDiscountMax("");
    setDateFrom(""); setDateTo(""); setPage(1);
  };

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
    setPage(1);
  };

  const openDetail = (row: LossOrderRow) => {
    if (row.order_id) { setSelectedOrderId(row.order_id); setDrawerOpen(true); }
  };

  if (!sessionId || !meta) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Loss Explorer" description="Search and investigate loss-making orders." />
        <EmptyState title="No dataset loaded" description="Load or import a dataset first." action={<button onClick={() => navigate("/data")} className="text-xs text-accent hover:underline">Go to Data Sources</button>} />
      </div>
    );
  }

  if (!analyzed) {
    return (
      <div className="px-6 lg:px-8 py-8">
        <PageHeader title="Loss Explorer" />
        <EmptyState title="Analysis not run" description="Run the analysis from the Overview page to explore loss orders." />
      </div>
    );
  }

  const exportUrl = sessionId ? exportLossOrdersUrl(sessionId, {
    search, category: category || undefined, sub_category: subCategory || undefined,
    region: region || undefined, segment: segment || undefined, loss_cause: lossCause || undefined,
    discount_min: discountMin ? parseFloat(discountMin) : undefined,
    discount_max: discountMax ? parseFloat(discountMax) : undefined,
    date_from: dateFrom || undefined, date_to: dateTo || undefined,
  }) : "#";

  return (
    <div className="px-6 lg:px-8 py-8">
      <PageHeader
        title="Loss Explorer"
        description="Search, filter, and investigate every loss-making order in the dataset."
        actions={
          <a
            href={exportUrl}
            download="profitleak_loss_orders.csv"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-ink-muted rounded-md hover:text-ink hover:border-ink-faint transition-colors"
          >
            <Download size={13} />
            Export CSV
          </a>
        }
      />

      {/* Summary row */}
      {result && (
        <div className="flex flex-wrap gap-6 mb-4 px-1">
          <div>
            <span className="text-2xs text-ink-faint font-mono uppercase tracking-wider">Matching orders</span>
            <p className="text-xl font-semibold text-ink tabular-nums">{fmtCount(result.total_matches)}</p>
          </div>
          <div>
            <span className="text-2xs text-ink-faint font-mono uppercase tracking-wider">Total loss</span>
            <p className="text-xl font-semibold text-loss tabular-nums">{fmtProfit(result.total_loss_amount)}</p>
          </div>
          <div>
            <span className="text-2xs text-ink-faint font-mono uppercase tracking-wider">Avg. loss / order</span>
            <p className="text-xl font-semibold text-loss tabular-nums">{fmtProfit(result.avg_loss_per_order)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden mb-4">
        <FilterBar hasActiveFilters={hasFilters} onReset={resetFilters}>
          <FilterInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search order ID or product…"
          />
          {filterOptions?.categories.length ? (
            <FilterSelect label="Category" value={category} options={filterOptions.categories} onChange={(v) => { setCategory(v); setPage(1); }} />
          ) : null}
          {filterOptions?.regions.length ? (
            <FilterSelect label="Region" value={region} options={filterOptions.regions} onChange={(v) => { setRegion(v); setPage(1); }} />
          ) : null}
          {filterOptions?.segments.length ? (
            <FilterSelect label="Segment" value={segment} options={filterOptions.segments} onChange={(v) => { setSegment(v); setPage(1); }} />
          ) : null}
          {filterOptions?.loss_causes.length ? (
            <FilterSelect label="Cause" value={lossCause} options={filterOptions.loss_causes} onChange={(v) => { setLossCause(v); setPage(1); }} />
          ) : null}
        </FilterBar>

        {/* Table */}
        {error && <ErrorState message={error} retry={fetch} />}
        {loading && !result && <LoadingSkeleton rows={10} cols={9} />}

        {result && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface sticky top-0 z-10">
                    {[
                      { key: "order_id", label: "Order ID", sortable: false },
                      { key: "order_date", label: "Date", sortable: true },
                      { key: "product_name", label: "Product", sortable: false },
                      { key: "category", label: "Category", sortable: false },
                      { key: "region", label: "Region", sortable: false },
                      { key: "gross_sales", label: "Gross Sales", sortable: true, align: "right" },
                      { key: "net_revenue", label: "Net Revenue", sortable: true, align: "right" },
                      { key: "net_profit", label: "Net Profit", sortable: true, align: "right" },
                      { key: "profit_margin", label: "Margin", sortable: false, align: "right" },
                      { key: "discount", label: "Discount", sortable: true, align: "right" },
                      { key: "loss_cause", label: "Cause", sortable: false },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        className={[
                          "px-3 py-2 text-2xs font-mono uppercase tracking-widest text-ink-faint whitespace-nowrap",
                          col.align === "right" ? "text-right" : "text-left",
                          col.sortable ? "cursor-pointer hover:text-ink-muted select-none" : "",
                        ].join(" ")}
                      >
                        {col.label}
                        {col.sortable && sortBy === col.key && (
                          <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr
                      key={row.order_id ?? i}
                      onClick={() => openDetail(row)}
                      className="border-b border-border-subtle/40 hover:bg-surface cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 font-mono text-2xs text-ink-faint whitespace-nowrap">{row.order_id ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-faint font-mono text-2xs whitespace-nowrap">{row.order_date ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-muted max-w-[160px] truncate">{row.product_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">{row.category ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">{row.region ?? "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(row.gross_sales)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-ink">{fmtCurrency(row.net_revenue)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-loss font-semibold">{fmtProfit(row.net_profit)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-loss">{fmtPct(row.profit_margin)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-ink-muted">{fmtPct(row.discount)}</td>
                      <td className="px-3 py-2.5"><Badge tone={lossCauseTone(row.loss_cause)}>{row.loss_cause}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.total_matches === 0 && (
              <EmptyState title="No orders match these filters" description="Try adjusting or clearing the filters." />
            )}

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={result.total_matches}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Order detail drawer */}
      {selectedOrderId && sessionId && (
        <OrderDetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sessionId={sessionId}
          orderId={selectedOrderId}
        />
      )}
    </div>
  );
}
