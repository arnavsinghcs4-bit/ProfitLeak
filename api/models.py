"""
Pydantic models for the ProfitLeak API.

Response models describe what the frontend consumes; all financial values
are computed by the existing profitleak pipeline, never by the client.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DatasetMeta(BaseModel):
    session_id: str
    name: str
    source: str = "upload"  # "upload" | "sample"
    row_count: int
    column_count: int
    status: str  # ready | processing | analyzed | error
    created_at: str
    analyzed_at: Optional[str] = None
    loss_order_count: Optional[int] = None
    files: Dict[str, Optional[str]] = Field(default_factory=dict)
    error: Optional[str] = None


class DatasetStatus(BaseModel):
    """Headline financial summary for a dataset (from the pipeline)."""
    orders: int
    gross_sales: float
    net_revenue: float
    net_profit: float
    overall_margin: float  # total net profit / total net revenue
    avg_order_margin: float  # mean of row-level margins (what the CLI reports)
    loss_orders: int
    loss_rate: float
    total_loss_amount: float
    avg_loss_per_order: float
    loss_causes: Dict[str, int]
    breakeven_discount: Optional[float] = None
    fit_slope: Optional[float] = None
    fit_intercept: Optional[float] = None
    fit_n: Optional[int] = None
    r_squared: Optional[float] = None
    category_breakevens: Dict[str, float] = Field(default_factory=dict)


class AnalysisResult(BaseModel):
    session_id: str
    summary: DatasetStatus
    # pivots / rankings / df are attached at runtime (not serialized directly)
    pivots: Any = Field(default=None, exclude=True)
    rankings: Any = Field(default=None, exclude=True)
    df: Any = Field(default=None, exclude=True)


class AnalysisSummaryResponse(BaseModel):
    session_id: str
    status: str
    analyzed_at: Optional[str] = None
    summary: Optional[DatasetStatus] = None
    assumptions: Dict[str, Any] = Field(default_factory=dict)
    columns_present: Dict[str, bool] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Time series
# ---------------------------------------------------------------------------

class TimeSeriesPoint(BaseModel):
    period: str  # e.g. "2023-01" or "2023"
    gross_sales: float
    net_revenue: float
    net_profit: float
    orders: int
    loss_orders: int


class TimeSeriesResponse(BaseModel):
    session_id: str
    granularity: str
    points: List[TimeSeriesPoint]


# ---------------------------------------------------------------------------
# Heatmap (category x region)
# ---------------------------------------------------------------------------

class HeatmapCell(BaseModel):
    category: str
    region: str
    net_profit: float
    profit_margin: float  # aggregate margin for the cell
    orders: int
    loss_orders: int


class HeatmapResponse(BaseModel):
    session_id: str
    categories: List[str]
    regions: List[str]
    cells: List[HeatmapCell]


# ---------------------------------------------------------------------------
# Scatter (discount vs margin)
# ---------------------------------------------------------------------------

class ScatterPoint(BaseModel):
    discount: float
    profit_margin: float
    net_revenue: float
    is_loss: bool


class ScatterResponse(BaseModel):
    session_id: str
    points: List[ScatterPoint]
    breakeven_discount: Optional[float] = None
    fit_slope: Optional[float] = None
    fit_intercept: Optional[float] = None
    r_squared: Optional[float] = None
    fit_n: Optional[int] = None


# ---------------------------------------------------------------------------
# Discount bands
# ---------------------------------------------------------------------------

class DiscountBandStats(BaseModel):
    band: str
    orders: int
    gross_sales: float
    net_revenue: float
    net_profit: float
    profit_margin: float  # aggregate margin for the band
    avg_order_margin: float
    loss_orders: int


class DiscountBandsResponse(BaseModel):
    session_id: str
    bands: List[DiscountBandStats]


# ---------------------------------------------------------------------------
# Loss explorer
# ---------------------------------------------------------------------------

class LossOrderRow(BaseModel):
    order_id: Optional[str] = None
    order_date: Optional[str] = None
    product_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    region: Optional[str] = None
    segment: Optional[str] = None
    gross_sales: float
    discount: float
    net_revenue: float
    net_profit: float
    profit_margin: float
    shipping_cost: float
    loss_cause: str


class LossOrdersResponse(BaseModel):
    session_id: str
    total_matches: int
    total_loss_amount: float
    avg_loss_per_order: float
    page: int
    page_size: int
    rows: List[LossOrderRow]


class LossCauseSummaryResponse(BaseModel):
    session_id: str
    causes: List[Dict[str, Any]]  # {cause, count, share, total_loss}


class OrderDetailResponse(BaseModel):
    session_id: str
    order: Dict[str, Any]
    metric_definitions: Dict[str, str]


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------

class ProductRow(BaseModel):
    product_name: str
    sub_category: Optional[str] = None
    category: Optional[str] = None
    orders: int
    gross_sales: float
    net_revenue: float
    net_profit: float
    profit_margin: float  # aggregate margin for the product
    avg_order_margin: float
    loss_orders: int


class BreakdownRow(BaseModel):
    name: str
    orders: int
    gross_sales: float
    net_revenue: float
    net_profit: float
    profit_margin: float


class ProductsResponse(BaseModel):
    session_id: str
    rows: List[ProductRow]
    total_products: int


class BreakdownResponse(BaseModel):
    session_id: str
    dimension: str  # category | sub_category | region | segment
    rows: List[BreakdownRow]


# ---------------------------------------------------------------------------
# Upload / preview
# ---------------------------------------------------------------------------

class ColumnMapping(BaseModel):
    """Maps expected standard keys to source column names (or None if absent)."""
    mappings: Dict[str, Optional[str]]
    rename: Dict[str, str]  # source_name -> standard_key


class PreviewResponse(BaseModel):
    filename: str
    size_bytes: int
    row_count: int
    columns: List[str]
    sample_rows: List[Dict[str, Any]]
    suggested_mapping: Dict[str, Optional[str]]


class ValidationIssue(BaseModel):
    severity: str  # error | warning | info
    field: Optional[str] = None
    message: str
    count: Optional[int] = None


class ValidationResponse(BaseModel):
    ok: bool
    issues: List[ValidationIssue]
    assumptions: List[str]
    session_id: Optional[str] = None


class RunAnalysisRequest(BaseModel):
    session_id: str
    generate_reports: bool = True


class FilterOptionsResponse(BaseModel):
    session_id: str
    categories: List[str] = Field(default_factory=list)
    sub_categories: List[str] = Field(default_factory=list)
    regions: List[str] = Field(default_factory=list)
    segments: List[str] = Field(default_factory=list)
    loss_causes: List[str] = Field(default_factory=list)
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    discount_max: Optional[float] = None


class ReportsListResponse(BaseModel):
    session_id: str
    reports: List[Dict[str, Any]]  # {key, filename, path, description, size_bytes, exists}


class ErrorResponse(BaseModel):
    detail: str