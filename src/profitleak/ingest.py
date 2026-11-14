"""
Ingest module: Load and validate raw data from CSV/Excel.
"""

import logging
from pathlib import Path
from typing import Optional, Set, Tuple
import pandas as pd
from profitleak.utils import get_logger

logger = get_logger()


def load_data(
    file_path: str,
    usecols: Optional[Set[str]] = None,
    chunksize: Optional[int] = None,
    dtype_mapping: Optional[dict] = None,
) -> pd.DataFrame:
    """
    Load CSV or Excel file with optional column selection and dtype optimization.

    Args:
        file_path: Path to CSV or Excel file
        usecols: Optional set of column names to load
        chunksize: Optional chunk size for large files (returns generator if set)
        dtype_mapping: Optional dict mapping column names to dtypes

    Returns:
        DataFrame or generator of DataFrames if chunksize is set

    Raises:
        FileNotFoundError: If file does not exist
        ValueError: If file format is not supported
    """
    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    suffix = file_path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(file_path, usecols=usecols, dtype=dtype_mapping, chunksize=chunksize)
    elif suffix in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path, usecols=usecols, dtype=dtype_mapping)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")

    logger.info(f"Loaded data from {file_path}")

    return df


def validate_columns(df: pd.DataFrame, required_columns: Set[str]) -> Tuple[bool, str]:
    """
    Validate that required columns exist in DataFrame.

    Args:
        df: Input DataFrame
        required_columns: Set of required column names

    Returns:
        Tuple of (is_valid, error_message)
    """
    missing = required_columns - set(df.columns)

    if missing:
        return False, f"Missing required columns: {missing}"

    return True, ""


def log_ingestion_summary(df: pd.DataFrame, file_path: str) -> None:
    """
    Log ingestion summary: row count, columns, date ranges.

    Args:
        df: Loaded DataFrame
        file_path: Source file path
    """
    logger.info(f"Ingestion Summary for {file_path}:")
    logger.info(f"  - Rows: {len(df)}")
    logger.info(f"  - Columns: {len(df.columns)}")
    logger.info(f"  - Columns: {list(df.columns)}")

    # Log data types
    for col, dtype in df.dtypes.items():
        logger.debug(f"    {col}: {dtype}")
