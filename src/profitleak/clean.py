"""
Clean module: Data cleaning, deduplication, null handling, type coercion, clipping.
"""

import logging
from typing import Tuple, Dict, Any
import pandas as pd
import numpy as np
from profitleak.utils import get_logger, clip_values

logger = get_logger()


def clean_data(df: pd.DataFrame, config: Dict[str, Any]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Clean raw order data: deduplicate, handle nulls, coerce types, clip invalid values.

    Args:
        df: Raw DataFrame
        config: Configuration dictionary

    Returns:
        Tuple of (cleaned_df, quality_summary)
    """
    quality = {"rows_dropped": {}, "rows_kept": len(df)}

    # Remove duplicates
    before = len(df)
    df = df.drop_duplicates()
    duplicates_dropped = before - len(df)
    if duplicates_dropped > 0:
        quality["rows_dropped"]["duplicates"] = duplicates_dropped
        logger.info(f"Removed {duplicates_dropped} duplicate rows")

    # Exclude returned orders if configured
    if config.get("cleaning", {}).get("exclude_returned_orders"):
        returned_col = config.get("columns", {}).get("returned")
        if returned_col and returned_col in df.columns:
            before = len(df)
            df = df[df[returned_col] != "Yes"]
            returned_dropped = before - len(df)
            if returned_dropped > 0:
                quality["rows_dropped"]["returned"] = returned_dropped
                logger.info(f"Excluded {returned_dropped} returned orders")

    quality["rows_kept"] = len(df)
    return df, quality


def coerce_dates(df: pd.DataFrame, date_columns: list) -> pd.DataFrame:
    """Coerce specified columns to datetime."""
    for col in date_columns:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')
    return df


def coerce_numerics(df: pd.DataFrame, numeric_columns: list) -> pd.DataFrame:
    """Coerce specified columns to numeric."""
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    return df


def clip_discount_values(df: pd.DataFrame, discount_col: str,
                         valid_range: list) -> pd.DataFrame:
    """Clip discount values to valid range [0, 1]."""
    if discount_col in df.columns:
        df[discount_col], clipped = clip_values(
            df[discount_col],
            min_val=valid_range[0],
            max_val=valid_range[1],
            clip_reason=f"discount outside {valid_range}",
        )
    return df
