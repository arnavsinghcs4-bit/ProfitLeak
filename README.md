# ProfitLeak: Automated E-Commerce Profitability Analysis Pipeline

## Overview

ProfitLeak is a high-performance Python analytics pipeline that transforms raw e-commerce order data into actionable profitability insights. It identifies loss-making orders, calculates true net profit (not just gross sales), detects discount thresholds that cause losses, and ranks top performers by profitability.

**Key Problem Solved**: High gross sales often hide losses caused by heavy discounts and shipping costs. ProfitLeak reveals which orders, products, and discount levels are actually profitable.

## Architecture

```
Raw Data (CSV/Excel)
    ↓ ingest.py (validate, log)
    ↓ clean.py (dedupe, nulls, dates, numerics, clip)
    ↓ features.py (temporal, discount bands, order tiers)
    ↓ finance.py (vectorized profit calculations)
    ↓ analysis.py (pivots, loss detection, breakeven)
    ↓ visuals.py (charts, dashboard)
    ↓ report.py (exports, markdown summary)
    → outputs/ (CSV, Excel, PNG, markdown)
```

## Features

### 1. **Vectorized Financial Engine** (`finance.py`)
- Computes Gross Sales, Discount Amount, Net Revenue, COGS, Shipping Costs, Net Profit, Margin
- Zero row loops: 100% NumPy/Pandas vectorized
- Safe division: handles zero denominators gracefully
- Missing data: estimates COGS and shipping as configurable percentages

### 2. **Loss Detection & Diagnosis** (`analysis.py`)
- Identifies all loss-making orders (842 on sample data = 8.4%)
- Tags loss causes: Discount-driven, Shipping-driven, Both, Cost-driven
- Computes breakeven discount via linear regression (`np.polyfit`)
- Per-category breakeven analysis

### 3. **Pivot Tables & Rankings** (`analysis.py`)
- Category × Region profit/margin heatmaps
- Sub-Category × Month profitability trends
- Top/bottom products by profit, margin, profit per order
- Gross vs. net comparison (identifies high-sales, low-profit items)

### 4. **Visualizations** (`visuals.py`)
- Margin heatmap (Category × Region)
- Monthly revenue vs. profit line chart
- Discount vs. margin scatter with regression line and breakeven marked
- Top 10 / Bottom 10 products by profit
- Loss-cause breakdown chart
- **Combined 2×3 dashboard** (PNG + PDF)

### 5. **Config-Driven** (`config.yaml`)
- Column name mappings (raw → standard names)
- Cost assumptions (Unit Cost %, Shipping %)
- Discount bands for categorization
- Thresholds for loss-cause tagging
- Analysis parameters

## Quick Start

### Installation

```bash
# Clone or navigate to project
cd ProfitLeak

# Install dependencies
pip install -r requirements.txt

# Install ProfitLeak in editable mode
pip install -e .
```

### Generate Synthetic Data

```bash
python scripts/generate_sample_data.py data/raw/sample_orders.csv
```

Creates 10,000 realistic orders with planted loss-making behavior (6.6% loss rate).

### Run Pipeline

```bash
python main.py \
  --input data/raw/sample_orders.csv \
  --config config.yaml \
  --output outputs/
```

**Output:**
```
================================================================================
ProfitLeak Pipeline Completed Successfully
================================================================================

Final Summary:
  Rows in:  10,000
  Rows out: 10,000
  Total Gross Sales: $7,833,233.11
  Total Net Revenue: $6,825,535.55
  Total Net Profit: $1,788,182.65
  Overall Profit Margin: 24.43%
  Loss-Making Orders: 842 (8.4%)
  Breakeven Discount: 36.31%

Total pipeline time: 1.77s
```

### Outputs

| File | Purpose |
|------|---------|
| `cleaned_orders.csv` | Full dataset with computed metrics |
| `loss_orders.csv` | 842 loss-making orders, ranked by loss size |
| `analysis_pivots.xlsx` | Pivot tables (Category×Region, etc.) |
| `dashboard.png` | 2×3 visualization dashboard |
| `summary_report.md` | Markdown findings report |
| `profitleak.log` | Detailed execution log |

## Configuration

### `config.yaml` — Key Sections

#### Column Mappings
```yaml
columns:
  sales: "Sales"           # Gross sales (quantity × list price)
  discount: "Discount"     # Discount % (0-1 range)
  unit_cost: "Unit Cost"   # COGS per unit
  shipping_cost: "Shipping Cost"  # Shipping cost per order
```

#### Cost Assumptions
```yaml
finance:
  unit_cost_pct_of_sales: 0.40       # If Unit Cost missing, estimate as 40% of sales
  shipping_cost_pct_of_sales: 0.10   # If Shipping Cost missing, estimate as 10% of sales
  payment_fee_pct: 0.03              # Optional: 3% of net revenue
```

#### Discount Bands
```yaml
features:
  discount_bands: [0.0, 0.01, 0.11, 0.21, 0.31, 0.41, 1.0]
  discount_band_labels: ["0%", "1-10%", "11-20%", "21-30%", "31-40%", "41%+"]
```

#### Analysis Thresholds
```yaml
analysis:
  discount_loss_threshold: 0.30      # Discount ≥ 30% tagged as "discount-driven"
  shipping_loss_threshold: 0.15      # Shipping ≥ 15% of revenue tagged as "shipping-driven"
```

## Test Coverage

**24 tests, all passing:**

- **Ingest** (5): Load CSV, validate columns, logging
- **Clean** (5): Deduplication, null handling, date/numeric coercion, clipping
- **Finance** (6): Profit formulas, safe division, missing data estimation, aggregation, loss flags
- **Analysis** (7): Loss tagging, breakeven detection, pivots, rankings, loss order detection

Run tests:
```bash
pytest tests/ -v
```

## Key Findings from Sample Data

- **8.4% of orders are loss-making** (842 / 10,000)
- **Breakeven discount: 36.31%** — orders discounted above this threshold tend to be unprofitable
- **Loss causes:**
  - 66.7% Both (discount + shipping)
  - 19.0% Shipping-driven (high shipping relative to revenue)
  - 7.8% Discount-driven (heavy discount alone)
  - 6.4% Cost-driven (high COGS)

## Project Structure

```
ProfitLeak/
├── src/profitleak/
│   ├── __init__.py           # Package init
│   ├── utils.py              # Logging, config loading, safe division
│   ├── ingest.py             # Load and validate CSV/Excel
│   ├── clean.py              # Deduplication, type coercion, clipping
│   ├── features.py           # Temporal, discount bands, order tiers
│   ├── finance.py            # Vectorized profit calculations
│   ├── analysis.py           # Loss detection, pivots, rankings
│   ├── visuals.py            # Matplotlib/Seaborn charts
│   └── report.py             # Export to CSV, Excel, markdown
├── tests/
│   ├── test_ingest.py        # Ingest tests
│   ├── test_clean.py         # Clean tests
│   ├── test_finance.py       # Finance tests (hand-calculated fixtures)
│   └── test_analysis.py      # Analysis tests
├── scripts/
│   └── generate_sample_data.py  # Synthetic data generator
├── data/
│   ├── raw/                  # Input data
│   └── processed/            # Intermediate results (if needed)
├── outputs/                  # Final outputs
├── main.py                   # CLI entry point
├── config.yaml               # Configuration (editable)
├── requirements.txt          # Python dependencies
├── setup.py                  # Package setup
├── pytest.ini                # Pytest config
├── .gitignore                # Git ignore
└── README.md                 # This file
```

## Design Decisions

### 1. **Vectorized Everywhere**
- No row-by-row loops: 100% NumPy/Pandas
- Reason: 10K+ rows process in <2 seconds; scales to millions
- Tools: `np.polyfit`, `np.select`, `pd.cut`, `pd.pivot_table`, `groupby`

### 2. **Config-Driven**
- All assumptions (cost %, thresholds, column names) in `config.yaml`
- Reason: Plug in real data without code changes
- Supports Superstore schema, Olist (Brazil) schema, custom schemas

### 3. **Safe Division**
- Every margin = profit / revenue uses safe division
- Returns 0 when revenue is 0 (not NaN/inf)
- Reason: Robust handling of edge cases

### 4. **Type Hints & Logging**
- Full type hints for IDE and mypy support
- Structured logging (INFO, DEBUG, ERROR) with optional file output
- Reason: Production-ready, debuggable

### 5. **Modular Architecture**
- Each module has one job (ingest, clean, finance, analysis, visuals, report)
- Easy to test, extend, or swap implementations
- Reason: Maintainability and clarity

## Limitations & Assumptions

1. **Assumes flat order data**: One row per order or per line item. If multi-level hierarchy, preprocess first.
2. **Discount range 0-1**: Config assumes discounts are decimal (0.30 = 30%). Adjust config if 0-100 range.
3. **Single-unit orders**: Profit formulas are per-order. Multi-unit items handled by aggregation.
4. **Missing data handling**: COGS and shipping estimated as % of sales if missing. Verify percentages match your data.
5. **Breakeven fit**: Linear regression (`np.polyfit`) assumes discount-margin relationship is approximately linear. Verify fit quality for your data.

## Performance

**Pipeline execution on 10,000 orders (synthetic data):**
- Ingest: 0.11s
- Clean: 0.12s
- Features: 0.00s (fast)
- Finance: 0.00s (fast, fully vectorized)
- Analysis: 0.01s (fast)
- Visualizations: 1.30s (matplotlib rendering)
- Export: 1.14s (CSV, Excel, markdown)
- **Total: 1.77s**

Scales linearly for 100K+ rows. For 1M+ rows, consider:
- Chunked reading: `pd.read_csv(chunksize=10000)`
- Parallel processing: Dask or PySpark
- Database backend: Load directly from SQL

## CLI Flags

```bash
python main.py \
  --input data/raw/orders.csv              # Input file (required)
  --config config.yaml                     # Config file (default: config.yaml)
  --output outputs/                        # Output directory (default: outputs/)
  --no-plots                               # Skip chart generation
  --exclude-returns                        # Exclude returned orders
```

## Dependencies

- **pandas** (≥2.2.0): Data manipulation
- **numpy** (≥1.26): Vectorized math
- **matplotlib** (≥3.8): Plotting
- **seaborn** (≥0.13): Statistical plots
- **pyyaml** (≥6.0): Config parsing
- **openpyxl** (≥3.0): Excel export
- **pytest** (≥7.4): Testing

## Future Enhancements

1. **Interactive dashboard**: Streamlit or Dash for real-time exploration
2. **Forecasting**: Predict profitability by discount level using scikit-learn
3. **Cohort analysis**: Segment customers by profitability
4. **Alerts**: Flag orders above loss threshold before fulfillment
5. **Benchmark reports**: Compare performance across time periods or regions

## Contributing

Contributions welcome! Areas for enhancement:
- Additional chart types (waterfall, Sankey)
- More statistical tests (ANOVA, t-tests for segment differences)
- Export to Power BI / Tableau
- REST API wrapper (FastAPI)

## License

MIT License (adjust as needed)

---

**Built with ❤️ for data-driven e-commerce teams.**

*Generated: 2026-10-26*
