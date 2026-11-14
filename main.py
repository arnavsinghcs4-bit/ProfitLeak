"""
Main CLI entry point for ProfitLeak pipeline.
"""

import argparse
import sys
import time
import logging
from pathlib import Path

from profitleak.utils import load_config, setup_logging
from profitleak.ingest import load_data, validate_columns, log_ingestion_summary
from profitleak.clean import clean_data, coerce_dates, coerce_numerics, clip_discount_values
from profitleak.features import engineer_temporal_features, engineer_discount_bands, engineer_order_size_tiers
from profitleak.finance import compute_financial_metrics
from profitleak.analysis import (
    tag_loss_causes, detect_loss_orders, detect_breakeven_discount,
    compute_pivot_tables, rank_top_performers
)
from profitleak.visuals import create_dashboard
from profitleak.report import (
    export_cleaned_csv, export_loss_orders, export_pivots_to_excel,
    export_rankings_to_excel, generate_summary_report
)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="ProfitLeak: Automated e-commerce profitability analysis pipeline"
    )
    parser.add_argument("--input", required=True, help="Input CSV or Excel file")
    parser.add_argument("--config", default="config.yaml", help="Config file path")
    parser.add_argument("--output", default="outputs/", help="Output directory")
    parser.add_argument("--no-plots", action="store_true", help="Skip chart generation")
    parser.add_argument("--exclude-returns", action="store_true", help="Exclude returned orders")

    args = parser.parse_args()

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load config
    try:
        config = load_config(args.config)
    except Exception as e:
        print(f"Error loading config: {e}", file=sys.stderr)
        return 1

    # Set up logging
    log_file = output_dir / config.get("logging", {}).get("log_file", "profitleak.log")
    log_level = config.get("logging", {}).get("level", "INFO")
    logger = setup_logging(str(log_file), log_level)

    logger.info("=" * 80)
    logger.info("ProfitLeak Pipeline Started")
    logger.info("=" * 80)

    start_time = time.time()

    try:
        # Phase 1: Ingest
        logger.info("\n[Phase 1] Ingesting raw data...")
        phase_start = time.time()

        df = load_data(args.input)
        log_ingestion_summary(df, args.input)
        rows_input = len(df)

        phase_time = time.time() - phase_start
        logger.info(f"Ingestion completed in {phase_time:.2f}s\n")

        # Phase 2: Clean
        logger.info("[Phase 2] Cleaning data...")
        phase_start = time.time()

        cols = config.get("columns", {})

        # Remap columns
        df = df.rename(columns={v: k for k, v in cols.items() if v in df.columns})

        # Clean
        df, quality = clean_data(df, config)

        # Coerce types
        date_cols = [cols.get("order_date"), cols.get("ship_date")]
        date_cols = [c for c in date_cols if c and c in df.columns]
        df = coerce_dates(df, date_cols)

        numeric_cols = [cols.get("sales"), cols.get("quantity"),
                       cols.get("discount"), cols.get("unit_cost"), cols.get("shipping_cost")]
        numeric_cols = [c for c in numeric_cols if c and c in df.columns]
        df = coerce_numerics(df, numeric_cols)

        # Clip discounts
        discount_col = cols.get("discount")
        if discount_col and discount_col in df.columns:
            discount_range = config.get("cleaning", {}).get("discount_range", [0, 1])
            df = clip_discount_values(df, discount_col, discount_range)

        rows_cleaned = len(df)
        logger.info(f"Data cleaned: {rows_input} → {rows_cleaned} rows ({rows_input - rows_cleaned} removed)")

        phase_time = time.time() - phase_start
        logger.info(f"Cleaning completed in {phase_time:.2f}s\n")

        # Phase 3: Features
        logger.info("[Phase 3] Engineering features...")
        phase_start = time.time()

        order_date_col = cols.get("order_date")
        ship_date_col = cols.get("ship_date")
        if order_date_col and order_date_col in df.columns:
            df = engineer_temporal_features(df, order_date_col, ship_date_col)

        discount_col = cols.get("discount")
        if discount_col and discount_col in df.columns:
            df = engineer_discount_bands(df, discount_col, config)

        sales_col = cols.get("sales")
        if sales_col and sales_col in df.columns:
            df = engineer_order_size_tiers(df, sales_col)

        phase_time = time.time() - phase_start
        logger.info(f"Feature engineering completed in {phase_time:.2f}s\n")

        # Phase 4: Finance
        logger.info("[Phase 4] Computing financial metrics...")
        phase_start = time.time()

        df = compute_financial_metrics(df, config)

        phase_time = time.time() - phase_start
        logger.info(f"Finance calculations completed in {phase_time:.2f}s\n")

        # Phase 5: Analysis
        logger.info("[Phase 5] Running analysis...")
        phase_start = time.time()

        df = tag_loss_causes(df, config)
        loss_df = detect_loss_orders(df)
        analysis_results = detect_breakeven_discount(df, config)
        pivots = compute_pivot_tables(df)
        rankings = rank_top_performers(df, config)

        phase_time = time.time() - phase_start
        logger.info(f"Analysis completed in {phase_time:.2f}s\n")

        # Phase 6: Visuals
        if not args.no_plots:
            logger.info("[Phase 6] Generating visualizations...")
            phase_start = time.time()

            dashboard_path = output_dir / config.get("reporting", {}).get("dashboard_png_file", "dashboard.png")
            create_dashboard(df, analysis_results, str(dashboard_path))

            phase_time = time.time() - phase_start
            logger.info(f"Visualizations completed in {phase_time:.2f}s\n")

        # Phase 7: Reports
        logger.info("[Phase 7] Exporting reports...")
        phase_start = time.time()

        cleaned_csv = output_dir / config.get("reporting", {}).get("cleaned_data_file", "cleaned_orders.csv")
        export_cleaned_csv(df, str(cleaned_csv))

        loss_csv = output_dir / config.get("reporting", {}).get("loss_orders_file", "loss_orders.csv")
        export_loss_orders(df, str(loss_csv))

        pivots_xlsx = output_dir / config.get("reporting", {}).get("pivot_workbook_file", "analysis_pivots.xlsx")
        export_pivots_to_excel(pivots, str(pivots_xlsx))

        summary_md = output_dir / config.get("reporting", {}).get("summary_report_file", "summary_report.md")
        generate_summary_report(df, analysis_results, pivots, rankings, str(summary_md))

        phase_time = time.time() - phase_start
        logger.info(f"Export completed in {phase_time:.2f}s\n")

        # Print summary
        logger.info("=" * 80)
        logger.info("ProfitLeak Pipeline Completed Successfully")
        logger.info("=" * 80)

        loss_rate = len(loss_df) / len(df) * 100
        logger.info(f"\nFinal Summary:")
        logger.info(f"  Rows in:  {rows_input:,}")
        logger.info(f"  Rows out: {rows_cleaned:,}")
        logger.info(f"  Total Gross Sales: ${df['gross_sales'].sum():,.2f}")
        logger.info(f"  Total Net Revenue: ${df['net_revenue'].sum():,.2f}")
        logger.info(f"  Total Net Profit: ${df['net_profit'].sum():,.2f}")
        logger.info(f"  Overall Profit Margin: {df['profit_margin'].mean()*100:.2f}%")
        logger.info(f"  Loss-Making Orders: {len(loss_df):,} ({loss_rate:.1f}%)")
        logger.info(f"  Breakeven Discount: {analysis_results.get('overall_breakeven_discount', 'N/A')}")

        total_time = time.time() - start_time
        logger.info(f"\nTotal pipeline time: {total_time:.2f}s")

        logger.info(f"\nOutputs saved to: {output_dir.absolute()}")

        return 0

    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
