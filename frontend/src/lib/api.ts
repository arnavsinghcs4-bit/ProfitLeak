/**
 * Typed API client for ProfitLeak.
 *
 * All endpoints mirror the FastAPI routes exactly. Financial formulas
 * are never reproduced here — every number comes from the backend.
 */

import type {
  AnalysisSummaryResponse,
  AppConfig,
  BreakdownResponse,
  DatasetMeta,
  DiscountBandsResponse,
  FilterOptionsResponse,
  HealthResponse,
  HeatmapResponse,
  LossCauseSummaryResponse,
  LossOrdersResponse,
  OrderDetailResponse,
  PreviewResponse,
  ProductsResponse,
  ReportItem,
  ScatterResponse,
  TimeSeriesResponse,
  ValidationResponse,
} from "@/types/api";

const BASE = "";

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? JSON.stringify(json);
    } catch {
      // ignore parse error
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const health = (): Promise<HealthResponse> =>
  apiFetch("/api/health");

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const listDatasets = (): Promise<{ datasets: DatasetMeta[] }> =>
  apiFetch("/api/datasets");

export const deleteDataset = (sid: string): Promise<{ deleted: string }> =>
  apiFetch(`/api/datasets/${sid}`, { method: "DELETE" });

export const loadSample = (): Promise<{ session_id: string; meta: DatasetMeta }> =>
  apiFetch("/api/sample/load", { method: "POST" });

// ---------------------------------------------------------------------------
// Upload workflow
// ---------------------------------------------------------------------------

export async function uploadFile(file: File): Promise<PreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json.detail ?? `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export async function createDataset(
  file: File,
  mapping: Record<string, string | null>
): Promise<ValidationResponse> {
  const form = new FormData();
  form.append("file", file);
  const mappingJson = JSON.stringify(mapping);
  const res = await fetch(`/api/datasets?mapping=${encodeURIComponent(mappingJson)}`, {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json.detail ?? `HTTP ${res.status}`, res.status);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export const runAnalysis = (
  sid: string,
  generate_reports = true
): Promise<{ meta: DatasetMeta }> =>
  apiFetch(`/api/datasets/${sid}/analyze`, {
    method: "POST",
    body: JSON.stringify({ session_id: sid, generate_reports }),
  });

export const getStatus = (sid: string): Promise<{ meta: DatasetMeta }> =>
  apiFetch(`/api/datasets/${sid}/status`);

export const getSummary = (sid: string): Promise<AnalysisSummaryResponse> =>
  apiFetch(`/api/datasets/${sid}/summary`);

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

export const getTimeSeries = (
  sid: string,
  granularity: "month" | "quarter" | "year" = "month"
): Promise<TimeSeriesResponse> =>
  apiFetch(`/api/datasets/${sid}/timeseries?granularity=${granularity}`);

export const getHeatmap = (sid: string): Promise<HeatmapResponse> =>
  apiFetch(`/api/datasets/${sid}/heatmap`);

export const getScatter = (sid: string): Promise<ScatterResponse> =>
  apiFetch(`/api/datasets/${sid}/scatter`);

export const getDiscountBands = (sid: string): Promise<DiscountBandsResponse> =>
  apiFetch(`/api/datasets/${sid}/discount-bands`);

// ---------------------------------------------------------------------------
// Loss explorer
// ---------------------------------------------------------------------------

export interface LossOrdersParams {
  search?: string;
  category?: string;
  sub_category?: string;
  region?: string;
  segment?: string;
  loss_cause?: string;
  discount_min?: number;
  discount_max?: number;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export function getLossOrders(
  sid: string,
  params: LossOrdersParams = {}
): Promise<LossOrdersResponse> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  return apiFetch(`/api/datasets/${sid}/loss-orders?${q}`);
}

export const getLossCauses = (sid: string): Promise<LossCauseSummaryResponse> =>
  apiFetch(`/api/datasets/${sid}/loss-causes`);

export const getOrderDetail = (sid: string, orderId: string): Promise<OrderDetailResponse> =>
  apiFetch(`/api/datasets/${sid}/orders/${encodeURIComponent(orderId)}`);

export const getFilterOptions = (sid: string): Promise<FilterOptionsResponse> =>
  apiFetch(`/api/datasets/${sid}/filter-options`);

export function exportLossOrdersUrl(sid: string, params: LossOrdersParams = {}): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  return `/api/datasets/${sid}/loss-orders/export?${q}`;
}

// ---------------------------------------------------------------------------
// Products & breakdowns
// ---------------------------------------------------------------------------

export interface ProductsParams {
  search?: string;
  category?: string;
  sub_category?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
}

export function getProducts(
  sid: string,
  params: ProductsParams = {}
): Promise<ProductsResponse> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  return apiFetch(`/api/datasets/${sid}/products?${q}`);
}

export const getBreakdown = (
  sid: string,
  dimension: "category" | "sub_category" | "region" | "segment"
): Promise<BreakdownResponse> =>
  apiFetch(`/api/datasets/${sid}/breakdown/${dimension}`);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const getReports = (
  sid: string
): Promise<{ session_id: string; reports: ReportItem[] }> =>
  apiFetch(`/api/datasets/${sid}/reports`);

export const downloadReportUrl = (sid: string, key: string): string =>
  `/api/datasets/${sid}/reports/${key}/download`;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const getSettings = (): Promise<{ config: AppConfig }> =>
  apiFetch("/api/settings");

export const putSettings = (config: AppConfig): Promise<{ config: AppConfig; saved: boolean }> =>
  apiFetch("/api/settings", {
    method: "PUT",
    body: JSON.stringify(config),
  });
