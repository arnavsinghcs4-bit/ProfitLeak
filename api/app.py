"""
ProfitLeak FastAPI application.

An adapter over the existing profitleak analytics package. All financial
math lives in src/profitleak; this layer only orchestrates, validates and
serializes.

Run (from repo root):
    uvicorn api.app:app --reload --port 8000
"""

import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .models import (
    BreakdownResponse,
    ColumnMapping,
    DiscountBandsResponse,
    ErrorResponse,
    FilterOptionsResponse,
    HeatmapResponse,
    LossCauseSummaryResponse,
    LossOrdersResponse,
    OrderDetailResponse,
    PreviewResponse,
    ProductRow,
    ProductsResponse,
    RunAnalysisRequest,
    ScatterResponse,
    TimeSeriesResponse,
    ValidationIssue,
    ValidationResponse,
)
from .service import (
    breakdown,
    discount_bands,
    discount_margin_scatter,
    filter_options,
    loss_cause_summary,
    loss_orders_query,
    order_detail,
    products,
    time_series,
)
from .store import (
    MAX_FILE_SIZE,
    MAX_ROWS,
    AnalysisStore,
    REPO_ROOT,
    SessionNotFoundError,
)

app = FastAPI(
    title="ProfitLeak API",
    description="Profitability intelligence API over the profitleak analytics pipeline.",
    version="0.1.0",
)

# CORS for local development (Vite dev server + local preview builds)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = AnalysisStore()

SAMPLE_CSV = REPO_ROOT / "data" / "raw" / "sample_orders.csv"

# Expected standard keys for column mapping (from config.yaml "columns")
EXPECTED_KEYS = [
    "order_id", "order_date", "ship_date", "segment", "region", "category",
    "sub_category", "product_name", "sales", "quantity", "discount",
    "unit_cost", "shipping_cost", "returned",
]
KEY_LABELS = {
    "sales": "Sales (gross, per line item)",
    "discount": "Discount (0-1 decimal)",
    "quantity": "Quantity",
    "unit_cost": "Unit cost (optional)",
    "shipping_cost": "Shipping cost (optional)",
    "order_id": "Order ID",
    "order_date": "Order date",
    "ship_date": "Ship date (optional)",
    "segment": "Segment (optional)",
    "region": "Region (optional)",
    "category": "Category (optional)",
    "sub_category": "Sub-category (optional)",
    "product_name": "Product name (optional)",
    "returned": "Returned flag (optional)",
}

METRIC_DEFINITIONS = {
    "gross_sales": "Sales column value: list price x quantity, before any discount.",
    "discount_amount": "Gross sales x discount percentage.",
    "net_revenue": "Gross sales - discount amount.",
    "cogs": "Quantity x unit cost. If unit cost is missing, estimated as (unit_cost_pct_of_sales x gross sales) using the configured assumption.",
    "shipping_cost": "Shipping cost column value. If missing, estimated as (shipping_cost_pct_of_sales x gross sales).",
    "payment_fee": "Net revenue x payment_fee_pct (only when payment_fee_pct > 0 in config).",
    "net_profit": "Net revenue - COGS - shipping cost - payment fee.",
    "profit_margin": "Net profit / net revenue (safe divide; 0 when net revenue is 0).",
    "loss_cause": "Heuristic, threshold-based tagging of loss-making orders using the configured discount_loss_threshold and shipping_loss_threshold. It is an indicator, not a proven causal attribution.",
}


def _session_or_404(session_id: str) -> Dict[str, Any]:
    try:
        return store.get_session(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


def _result_or_404(session_id: str):
    try:
        return store.get_result(session_id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> Dict[str, Any]:
    cfg = store.get_config()
    finance = cfg.get("finance", {})
    return {
        "status": "ok",
        "version": app.version,
        "active_sessions": len(store.list_sessions()),
        "assumptions": {
            "unit_cost_pct_of_sales": finance.get("unit_cost_pct_of_sales", 0.40),
            "shipping_cost_pct_of_sales": finance.get("shipping_cost_pct_of_sales", 0.10),
            "payment_fee_pct": finance.get("payment_fee_pct", 0.0),
        },
    }


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

@app.post("/api/sample/load")
def load_sample() -> Dict[str, Any]:
    """Create a session from the repository's bundled sample dataset."""
    if not SAMPLE_CSV.exists():
        raise HTTPException(status_code=404, detail="Sample dataset not found on the server.")
    try:
        df = pd.read_csv(SAMPLE_CSV)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read sample dataset: {e}")
    if len(df) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Sample dataset exceeds the {MAX_ROWS:,}-row limit.")
    session_id = store.create_session(df, "Sample orders (10,000)", source="sample")
    return {"session_id": session_id, "meta": store.get_meta(session_id)}


# ---------------------------------------------------------------------------
# Upload / preview / validation
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> PreviewResponse:
    """Upload a CSV/XLSX file and return a preview with a suggested column mapping."""
    if file.filename and not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload a .csv, .xlsx or .xls file.")

    # Upload to a temp path; never trust the client filename as a filesystem path
    suffix = Path(file.filename or "upload.csv").suffix or ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        size = tmp_path.stat().st_size
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File is {size / 1024 / 1024:.1f} MB; the limit is {MAX_FILE_SIZE / 1024 / 1024:.0f} MB.")
        try:
            if suffix == ".csv":
                df = pd.read_csv(tmp_path, nrows=MAX_ROWS)
            else:
                df = pd.read_excel(tmp_path, nrows=MAX_ROWS)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse file: {type(e).__name__}. Check that it is a valid CSV or Excel file.")
    finally:
        tmp_path.unlink(missing_ok=True)

    if df.empty:
        raise HTTPException(status_code=400, detail="The file contains no rows.")

    sample_rows: List[Dict[str, Any]] = []
    for _, row in df.head(5).iterrows():
        sample_rows.append({col: _jsonify(row[col]) for col in df.columns})

    return PreviewResponse(
        filename=Path(file.filename or "upload").name,  # display name only
        size_bytes=size,
        row_count=len(df),
        columns=list(df.columns),
        sample_rows=sample_rows,
        suggested_mapping=_suggest_mapping(df),
    )


def _jsonify(v: Any) -> Any:
    if v is None or (isinstance(v, float) and v != v):
        return None
    if hasattr(v, "isoformat"):
        return str(v)
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


def _suggest_mapping(df: pd.DataFrame) -> Dict[str, Optional[str]]:
    """Suggest source columns for each expected key by matching known aliases."""
    aliases: Dict[str, List[str]] = {
        "order_id": ["order id", "order_id", "orderid", "id", "invoice"],
        "order_date": ["order date", "order_date", "date", "created"],
        "ship_date": ["ship date", "ship_date", "shipping date", "shipped"],
        "segment": ["segment", "customer segment"],
        "region": ["region", "market", "zone"],
        "category": ["category", "product category"],
        "sub_category": ["sub-category", "sub_category", "subcategory", "sub cat"],
        "product_name": ["product name", "product_name", "product", "item"],
        "sales": ["sales", "sale amount", "revenue", "amount", "gross sales", "list total"],
        "quantity": ["quantity", "qty", "units"],
        "discount": ["discount", "discount pct", "discount rate"],
        "unit_cost": ["unit cost", "unit_cost", "cost", "item cost"],
        "shipping_cost": ["shipping cost", "shipping_cost", "shipping", "freight"],
        "returned": ["returned", "return flag", "is returned"],
    }
    normalized = {str(c).strip().lower(): c for c in df.columns}
    mapping: Dict[str, Optional[str]] = {}
    for key, names in aliases.items():
        match = None
        for n in names:
            if n in normalized:
                match = normalized[n]
                break
        mapping[key] = match
    return mapping


@app.post("/api/datasets/validate")
def validate_mapping(
    filename: str = Query(...),
    row_count: int = Query(...),
    mappings: ColumnMapping = ...,
) -> ValidationResponse:
    """
    Validate a proposed column mapping and create a session.

    The frontend re-sends the file's preview columns; we validate here by
    checking which required columns would be produced after renaming.
    """
    issues: List[ValidationIssue] = []
    rename = mappings.rename  # source -> standard key

    produced = set(mappings.mappings.keys()) if False else set()
    for src, key in rename.items():
        if key:
            produced.add(key)

    required = {"sales"}
    missing_required = required - produced
    for key in missing_required:
        issues.append(ValidationIssue(
            severity="error",
            field=key,
            message=f"The '{KEY_LABELS.get(key, key)}' column is required but no source column is mapped to it.",
        ))

    recommended = {"discount", "quantity", "order_date"}
    for key in recommended - produced:
        issues.append(ValidationIssue(
            severity="warning",
            field=key,
            message=f"No column mapped for '{KEY_LABELS.get(key, key)}'. The pipeline will fall back to defaults (discounts treated as 0, no time analysis).",
        ))

    assumptions: List[str] = []
    if "unit_cost" not in produced:
        cfg = store.get_config()
        pct = cfg.get("finance", {}).get("unit_cost_pct_of_sales", 0.40)
        assumptions.append(f"Unit cost is missing — COGS will be estimated as {pct:.0%} of gross sales.")
    if "shipping_cost" not in produced:
        cfg = store.get_config()
        pct = cfg.get("finance", {}).get("shipping_cost_pct_of_sales", 0.10)
        assumptions.append(f"Shipping cost is missing — shipping will be estimated as {pct:.0%} of gross sales.")

    # Discount range sanity: handled at analysis time by clipping + warnings
    issues.append(ValidationIssue(
        severity="info",
        field="discount",
        message="Discount values are assumed to be decimals between 0 and 1 (0.30 = 30%). Values outside [0, 1] are clipped to the valid range.",
    ))

    ok = not any(i.severity == "error" for i in issues)
    return ValidationResponse(ok=ok, issues=issues, assumptions=assumptions)


@app.post("/api/datasets")
async def create_dataset(
    file: UploadFile = File(...),
    mapping: Optional[str] = Query(None, description="JSON mapping of standard key -> source column"),
) -> ValidationResponse:
    """
    Create a session from an uploaded file with an explicit column mapping.
    Runs full data-quality validation on the parsed data.
    """
    import json as _json

    suffix = Path(file.filename or "upload.csv").suffix
    if suffix.lower() not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        try:
            if suffix == ".csv":
                df = pd.read_csv(tmp_path, nrows=MAX_ROWS)
            else:
                df = pd.read_excel(tmp_path, nrows=MAX_ROWS)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not parse the file.")
    finally:
        tmp_path.unlink(missing_ok=True)

    if mapping:
        try:
            key_to_src: Dict[str, Optional[str]] = _json.loads(mapping)
        except _json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid mapping JSON.")
        rename = {src: key for key, src in key_to_src.items() if src}
        df = df.rename(columns=rename)

    if len(df) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"File exceeds the {MAX_ROWS:,}-row limit.")

    # --- data-quality validation on the renamed frame ---
    issues: List[ValidationIssue] = []
    assumptions: List[str] = []

    sales_col = "sales" if "sales" in df.columns else ("Sales" if "Sales" in df.columns else None)
    if sales_col is None:
        issues.append(ValidationIssue(severity="error", field="sales", message="No 'Sales' column found after mapping. A sales column is required."))
    else:
        sales_num = pd.to_numeric(df[sales_col], errors="coerce")
        bad_sales = int(sales_num.isna().sum() - df[sales_col].isna().sum())
        if bad_sales:
            issues.append(ValidationIssue(severity="warning", field="sales", message=f"{bad_sales} rows have non-numeric sales values; they will be dropped from financial calculations.", count=bad_sales))

    if "discount" in df.columns:
        d = pd.to_numeric(df["discount"], errors="coerce")
        out_of_range = int(((d < 0) | (d > 1)).sum())
        if out_of_range:
            issues.append(ValidationIssue(severity="warning", field="discount", message=f"{out_of_range} rows have discounts outside [0, 1]; they will be clipped to the valid range.", count=out_of_range))

    if "order_date" in df.columns:
        parsed = pd.to_datetime(df["order_date"], errors="coerce")
        unparseable = int(parsed.isna().sum() - df["order_date"].isna().sum())
        if unparseable:
            issues.append(ValidationIssue(severity="warning", field="order_date", message=f"{unparseable} rows have malformed dates; time-based views will exclude them.", count=unparseable))

    required_nulls = df[[c for c in ("sales",) if c in df.columns]].isna().sum()
    for col, n in required_nulls.items():
        if n:
            issues.append(ValidationIssue(severity="error", field=col, message=f"{n} rows are missing a value for '{col}'.", count=int(n)))

    if "unit_cost" not in df.columns:
        pct = store.get_config().get("finance", {}).get("unit_cost_pct_of_sales", 0.40)
        assumptions.append(f"Unit cost missing — COGS estimated as {pct:.0%} of gross sales (configurable in Settings).")
    if "shipping_cost" not in df.columns:
        pct = store.get_config().get("finance", {}).get("shipping_cost_pct_of_sales", 0.10)
        assumptions.append(f"Shipping cost missing — estimated as {pct:.0%} of gross sales (configurable in Settings).")

    ok = not any(i.severity == "error" for i in issues)
    session_id = None
    if ok:
        session_id = store.create_session(df, Path(file.filename or "dataset").name, source="upload")

    return ValidationResponse(ok=ok, issues=issues, assumptions=assumptions, session_id=session_id)


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

@app.post("/api/datasets/{session_id}/analyze")
def run_analysis(session_id: str, body: RunAnalysisRequest) -> Dict[str, Any]:
    _session_or_404(session_id)
    try:
        meta = store.run_analysis(session_id, generate_reports=body.generate_reports)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {type(e).__name__}. Check that required numeric columns (sales) exist and contain valid values.")
    return {"meta": meta}


@app.get("/api/datasets/{session_id}/status")
def analysis_status(session_id: str) -> Dict[str, Any]:
    _session_or_404(session_id)
    meta = store.get_meta(session_id)
    return {"meta": meta}


@app.get("/api/datasets/{session_id}/summary")
def analysis_summary(session_id: str) -> Dict[str, Any]:
    result = _result_or_404(session_id)
    meta = store.get_meta(session_id)
    cfg = store.get_config()
    df = store.get_df(session_id)

    assumptions = {
        "unit_cost_pct_of_sales": cfg.get("finance", {}).get("unit_cost_pct_of_sales", 0.40),
        "shipping_cost_pct_of_sales": cfg.get("finance", {}).get("shipping_cost_pct_of_sales", 0.10),
        "payment_fee_pct": cfg.get("finance", {}).get("payment_fee_pct", 0.0),
        "discount_loss_threshold": cfg.get("analysis", {}).get("discount_loss_threshold", 0.30),
        "shipping_loss_threshold": cfg.get("analysis", {}).get("shipping_loss_threshold", 0.15),
    }
    columns_present = {
        "order_date": bool(df.get("order_date", pd.Series(dtype=object)).notna().any()) if "order_date" in df.columns else False,
        "region": "region" in df.columns or "Region" in df.columns,
        "category": "category" in df.columns or "Category" in df.columns,
        "sub_category": "sub_category" in df.columns or "Sub-Category" in df.columns,
        "segment": "segment" in df.columns or "Segment" in df.columns,
        "product_name": "product_name" in df.columns or "Product Name" in df.columns,
        "unit_cost": any(c in df.columns for c in ("unit_cost", "Unit Cost")),
        "shipping_cost": any(c in df.columns for c in ("shipping_cost", "Shipping Cost")),
    }
    return {
        "session_id": session_id,
        "status": meta.status,
        "analyzed_at": meta.analyzed_at,
        "summary": result.summary,
        "assumptions": assumptions,
        "columns_present": columns_present,
    }


# ---------------------------------------------------------------------------
# Analysis endpoints
# ---------------------------------------------------------------------------

@app.get("/api/datasets/{session_id}/timeseries")
def get_timeseries(session_id: str, granularity: str = Query("month", pattern="^(month|quarter|year)$")) -> TimeSeriesResponse:
    _result_or_404(session_id)
    points = time_series(store, session_id, granularity)
    return TimeSeriesResponse(session_id=session_id, granularity=granularity, points=points)


@app.get("/api/datasets/{session_id}/heatmap")
def get_heatmap(session_id: str) -> HeatmapResponse:
    _result_or_404(session_id)
    data = category_region_heatmap(store, session_id)
    if data is None:
        return HeatmapResponse(session_id=session_id, categories=[], regions=[], cells=[])
    return HeatmapResponse(session_id=session_id, **data)


def category_region_heatmap(store: AnalysisStore, session_id: str):
    from .service import category_region_heatmap as fn
    return fn(store, session_id)


@app.get("/api/datasets/{session_id}/scatter")
def get_scatter(session_id: str) -> ScatterResponse:
    _result_or_404(session_id)
    data = discount_margin_scatter(store, session_id)
    return ScatterResponse(session_id=session_id, **data)


@app.get("/api/datasets/{session_id}/discount-bands")
def get_discount_bands(session_id: str) -> DiscountBandsResponse:
    _result_or_404(session_id)
    bands = discount_bands(store, session_id)
    return DiscountBandsResponse(session_id=session_id, bands=bands)


@app.get("/api/datasets/{session_id}/loss-orders")
def get_loss_orders(
    session_id: str,
    search: str = "",
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    region: Optional[str] = None,
    segment: Optional[str] = None,
    loss_cause: Optional[str] = None,
    discount_min: Optional[float] = None,
    discount_max: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = Query("net_profit", pattern="^(net_profit|net_revenue|gross_sales|discount|order_date)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> LossOrdersResponse:
    _result_or_404(session_id)
    r = loss_orders_query(
        store, session_id, search=search, category=category, sub_category=sub_category,
        region=region, segment=segment, loss_cause=loss_cause,
        discount_min=discount_min, discount_max=discount_max,
        date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir, page=page, page_size=page_size,
    )
    return LossOrdersResponse(session_id=session_id, page=page, page_size=page_size, **r)


@app.get("/api/datasets/{session_id}/loss-causes")
def get_loss_causes(session_id: str) -> LossCauseSummaryResponse:
    _result_or_404(session_id)
    return LossCauseSummaryResponse(session_id=session_id, causes=loss_cause_summary(store, session_id))


@app.get("/api/datasets/{session_id}/orders/{order_id}")
def get_order_detail(session_id: str, order_id: str) -> OrderDetailResponse:
    _result_or_404(session_id)
    detail = order_detail(store, session_id, order_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Order not found in this dataset.")
    return OrderDetailResponse(session_id=session_id, order=detail, metric_definitions=METRIC_DEFINITIONS)


@app.get("/api/datasets/{session_id}/filter-options")
def get_filter_options(session_id: str) -> FilterOptionsResponse:
    _result_or_404(session_id)
    return FilterOptionsResponse(session_id=session_id, **filter_options(store, session_id))


@app.get("/api/datasets/{session_id}/loss-orders/export")
def export_loss_orders_csv(
    session_id: str,
    search: str = "",
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    region: Optional[str] = None,
    segment: Optional[str] = None,
    loss_cause: Optional[str] = None,
    discount_min: Optional[float] = None,
    discount_max: Optional[float] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """CSV export of the currently filtered loss-making orders."""
    _result_or_404(session_id)
    r = loss_orders_query(
        store, session_id, search=search, category=category, sub_category=sub_category,
        region=region, segment=segment, loss_cause=loss_cause,
        discount_min=discount_min, discount_max=discount_max,
        date_from=date_from, date_to=date_to,
        sort_by="net_profit", sort_dir="asc", page=1, page_size=500,
    )
    if not r["rows"]:
        raise HTTPException(status_code=404, detail="No loss-making orders match the current filters.")

    rows = [row.model_dump() for row in r["rows"]]
    out = tempfile.NamedTemporaryFile(suffix=".csv", delete=False)
    pd.DataFrame(rows).to_csv(out.name, index=False)
    out.close()
    return FileResponse(out.name, filename="profitleak_loss_orders.csv", media_type="text/csv")


# ---------------------------------------------------------------------------
# Products & breakdowns
# ---------------------------------------------------------------------------

@app.get("/api/datasets/{session_id}/products")
def get_products(
    session_id: str,
    search: str = "",
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    sort_by: str = Query("net_profit", pattern="^(net_profit|net_revenue|gross_sales|profit_margin|orders|loss_orders)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(200, ge=1, le=1000),
) -> ProductsResponse:
    _result_or_404(session_id)
    r = products(store, session_id, search=search, category=category, sub_category=sub_category,
                 sort_by=sort_by, sort_dir=sort_dir, limit=limit)
    return ProductsResponse(session_id=session_id, rows=r["rows"], total_products=r["total_products"])


@app.get("/api/datasets/{session_id}/breakdown/{dimension}")
def get_breakdown(session_id: str, dimension: str) -> BreakdownResponse:
    _result_or_404(session_id)
    if dimension not in ("category", "sub_category", "region", "segment"):
        raise HTTPException(status_code=400, detail="Dimension must be one of: category, sub_category, region, segment.")
    rows = breakdown(store, session_id, dimension)
    return BreakdownResponse(session_id=session_id, dimension=dimension, rows=rows)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.get("/api/datasets/{session_id}/reports")
def list_reports(session_id: str) -> Dict[str, Any]:
    _session_or_404(session_id)
    meta = store.get_meta(session_id)
    descriptions = {
        "cleaned_orders": "Full dataset with computed financial metrics.",
        "loss_orders": "All loss-making orders ranked by loss size.",
        "pivot_workbook": "Excel workbook of pivot tables (Category×Region, Sub-Category×Month, Segment×Discount band).",
        "summary_report": "Markdown summary of headline findings.",
        "dashboard_png": "Static 2×3 chart dashboard image.",
    }
    reports = []
    for key, path in (meta.files or {}).items():
        p = Path(path) if path else None
        reports.append({
            "key": key,
            "filename": p.name if p else None,
            "path": str(p) if p else None,
            "description": descriptions.get(key, ""),
            "size_bytes": p.stat().st_size if p and p.exists() else None,
            "exists": bool(p and p.exists()),
        })
    return {"session_id": session_id, "reports": reports}


@app.get("/api/datasets/{session_id}/reports/{key}/download")
def download_report(session_id: str, key: str):
    _session_or_404(session_id)
    meta = store.get_meta(session_id)
    path = (meta.files or {}).get(key)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Report not available. Run the analysis with report generation enabled first.")
    return FileResponse(path, filename=Path(path).name)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@app.get("/api/datasets")
def list_datasets() -> Dict[str, Any]:
    return {"datasets": [m.model_dump() for m in store.list_sessions()]}


@app.delete("/api/datasets/{session_id}")
def delete_dataset(session_id: str) -> Dict[str, Any]:
    _session_or_404(session_id)
    shutil.rmtree(REPO_ROOT / "outputs" / "sessions" / session_id, ignore_errors=True)
    store.delete_session(session_id)
    return {"deleted": session_id}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings() -> Dict[str, Any]:
    return {"config": store.get_config()}


@app.put("/api/settings")
def put_settings(config: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and persist a settings update. Only known sections are accepted."""
    current = store.get_config()

    # Whitelisted sections/keys; values validated before saving.
    allowed = {
        "finance": {"unit_cost_pct_of_sales", "shipping_cost_pct_of_sales", "payment_fee_pct"},
        "features": {"discount_bands", "discount_band_labels"},
        "analysis": {"discount_loss_threshold", "shipping_loss_threshold"},
        "reporting": {"top_n_products", "bottom_n_products"},
    }

    def _validate(section: str, key: str, value: Any) -> Optional[str]:
        if key in ("unit_cost_pct_of_sales", "shipping_cost_pct_of_sales", "payment_fee_pct"):
            if not isinstance(value, (int, float)) or not (0 <= value <= 1):
                return f"{section}.{key} must be a number between 0 and 1."
        if key in ("discount_loss_threshold", "shipping_loss_threshold"):
            if not isinstance(value, (int, float)) or not (0 <= value <= 1):
                return f"{section}.{key} must be a number between 0 and 1."
        if key in ("top_n_products", "bottom_n_products"):
            if not isinstance(value, int) or not (1 <= value <= 100):
                return f"{section}.{key} must be an integer between 1 and 100."
        if key == "discount_bands" and (not isinstance(value, list) or len(value) < 2 or not all(isinstance(v, (int, float)) for v in value)):
            return "features.discount_bands must be a list of at least two numbers, ascending."
        if key == "discount_band_labels" and (not isinstance(value, list) or not all(isinstance(v, str) for v in value)):
            return "features.discount_band_labels must be a list of strings."
        return None

    errors: List[str] = []
    new_section_data: Dict[str, Dict[str, Any]] = {}
    for section, keys in allowed.items():
        if section not in config:
            continue
        incoming = config[section]
        if not isinstance(incoming, dict):
            errors.append(f"Section '{section}' must be an object.")
            continue
        for key, value in incoming.items():
            if key not in keys:
                continue  # silently ignore unknown keys rather than corrupting config
            err = _validate(section, key, value)
            if err:
                errors.append(err)
            else:
                new_section_data.setdefault(section, {})[key] = value

    if errors:
        return JSONResponse(status_code=422, content={"detail": errors})

    merged = current
    for section, updates in new_section_data.items():
        merged.setdefault(section, {}).update(updates)

    # Cross-check: bands and labels lengths must match
    bands = merged.get("features", {}).get("discount_bands", [])
    labels = merged.get("features", {}).get("discount_band_labels", [])
    if len(bands) - 1 != len(labels):
        return JSONResponse(status_code=422, content={"detail": [f"discount_bands has {len(bands)} edges but discount_band_labels has {len(labels)} labels — expected {len(bands) - 1} labels."]})

    store.save_config(merged)
    return {"config": merged, "saved": True}


# ---------------------------------------------------------------------------
# Errors as JSON, no stack traces
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error. Check the server logs for details."})