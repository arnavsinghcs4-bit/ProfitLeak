/**
 * TypeScript mirrors of the ProfitLeak FastAPI Pydantic models.
 * These match the exact JSON shapes returned by the backend.
 */

// ---------------------------------------------------------------------------
// Session / Dataset
// ---------------------------------------------------------------------------

export interface DatasetMeta {
  session_id: string;
  name: string;
  source: "upload" | "sample";
  row_count: number;
  column_count: number;
  status: "ready" | "processing" | "analyzed" | "error";
  created_at: string;
  analyzed_at: string | null;
  loss_order_count: number | null;
  files: Record<string, string | null>;
  error: string | null;
}

export interface DatasetStatus {
  orders: number;
  gross_sales: number;
  net_revenue: number;
  net_profit: number;
  overall_margin: number; // total net profit / total net revenue
  avg_order_margin: number; // mean of row-level margins
  loss_orders: number;
  loss_rate: number;
  total_loss_amount: number;
  avg_loss_per_order: number;
  loss_causes: Record<string, number>;
  breakeven_discount: number | null;
  fit_slope: number | null;
  fit_intercept: number | null;
  fit_n: number | null;
  r_squared: number | null;
  category_breakevens: Record<string, number>;
}

export interface AnalysisSummaryResponse {
  session_id: string;
  status: string;
  analyzed_at: string | null;
  summary: DatasetStatus;
  assumptions: {
    unit_cost_pct_of_sales: number;
    shipping_cost_pct_of_sales: number;
    payment_fee_pct: number;
    discount_loss_threshold: number;
    shipping_loss_threshold: number;
  };
  columns_present: {
    order_date: boolean;
    region: boolean;
    category: boolean;
    sub_category: boolean;
    segment: boolean;
    product_name: boolean;
    unit_cost: boolean;
    shipping_cost: boolean;
  };
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  period: string;
  gross_sales: number;
  net_revenue: number;
  net_profit: number;
  orders: number;
  loss_orders: number;
}

export interface TimeSeriesResponse {
  session_id: string;
  granularity: string;
  points: TimeSeriesPoint[];
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  category: string;
  region: string;
  net_profit: number;
  profit_margin: number;
  orders: number;
  loss_orders: number;
}

export interface HeatmapResponse {
  session_id: string;
  categories: string[];
  regions: string[];
  cells: HeatmapCell[];
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

export interface ScatterPoint {
  discount: number;
  profit_margin: number;
  net_revenue: number;
  is_loss: boolean;
}

export interface ScatterResponse {
  session_id: string;
  points: ScatterPoint[];
  breakeven_discount: number | null;
  fit_slope: number | null;
  fit_intercept: number | null;
  r_squared: number | null;
  fit_n: number | null;
}

// ---------------------------------------------------------------------------
// Discount bands
// ---------------------------------------------------------------------------

export interface DiscountBandStats {
  band: string;
  orders: number;
  gross_sales: number;
  net_revenue: number;
  net_profit: number;
  profit_margin: number;
  avg_order_margin: number;
  loss_orders: number;
}

export interface DiscountBandsResponse {
  session_id: string;
  bands: DiscountBandStats[];
}

// ---------------------------------------------------------------------------
// Loss explorer
// ---------------------------------------------------------------------------

export interface LossOrderRow {
  order_id: string | null;
  order_date: string | null;
  product_name: string | null;
  category: string | null;
  sub_category: string | null;
  region: string | null;
  segment: string | null;
  gross_sales: number;
  discount: number;
  net_revenue: number;
  net_profit: number;
  profit_margin: number;
  shipping_cost: number;
  loss_cause: string;
}

export interface LossOrdersResponse {
  session_id: string;
  total_matches: number;
  total_loss_amount: number;
  avg_loss_per_order: number;
  page: number;
  page_size: number;
  rows: LossOrderRow[];
}

export interface LossCause {
  cause: string;
  count: number;
  share: number;
  total_loss: number;
}

export interface LossCauseSummaryResponse {
  session_id: string;
  causes: LossCause[];
}

export interface OrderDetailResponse {
  session_id: string;
  order: Record<string, unknown>;
  metric_definitions: Record<string, string>;
}

export interface FilterOptionsResponse {
  session_id: string;
  categories: string[];
  sub_categories: string[];
  regions: string[];
  segments: string[];
  loss_causes: string[];
  date_min: string | null;
  date_max: string | null;
  discount_max: number | null;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductRow {
  product_name: string;
  sub_category: string | null;
  category: string | null;
  orders: number;
  gross_sales: number;
  net_revenue: number;
  net_profit: number;
  profit_margin: number;
  avg_order_margin: number;
  loss_orders: number;
}

export interface ProductsResponse {
  session_id: string;
  rows: ProductRow[];
  total_products: number;
}

export interface BreakdownRow {
  name: string;
  orders: number;
  gross_sales: number;
  net_revenue: number;
  net_profit: number;
  profit_margin: number;
}

export interface BreakdownResponse {
  session_id: string;
  dimension: string;
  rows: BreakdownRow[];
}

// ---------------------------------------------------------------------------
// Upload / import
// ---------------------------------------------------------------------------

export interface PreviewResponse {
  filename: string;
  size_bytes: number;
  row_count: number;
  columns: string[];
  sample_rows: Record<string, unknown>[];
  suggested_mapping: Record<string, string | null>;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  field: string | null;
  message: string;
  count: number | null;
}

export interface ValidationResponse {
  ok: boolean;
  issues: ValidationIssue[];
  assumptions: string[];
  session_id: string | null;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportItem {
  key: string;
  filename: string | null;
  path: string | null;
  description: string;
  size_bytes: number | null;
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppConfig {
  finance?: {
    unit_cost_pct_of_sales?: number;
    shipping_cost_pct_of_sales?: number;
    payment_fee_pct?: number;
  };
  features?: {
    discount_bands?: number[];
    discount_band_labels?: string[];
  };
  analysis?: {
    discount_loss_threshold?: number;
    shipping_loss_threshold?: number;
  };
  reporting?: {
    top_n_products?: number;
    bottom_n_products?: number;
  };
  columns?: Record<string, string>;
  cleaning?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  version: string;
  active_sessions: number;
  assumptions: {
    unit_cost_pct_of_sales: number;
    shipping_cost_pct_of_sales: number;
    payment_fee_pct: number;
  };
}
