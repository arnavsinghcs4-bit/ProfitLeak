"""
Utility functions: config loading, logging, safe division, and helpers.
"""

import logging
import yaml
from pathlib import Path
from typing import Dict, Any
import numpy as np
import pandas as pd


def load_config(config_path: str) -> Dict[str, Any]:
    """
    Load configuration from YAML file.

    Args:
        config_path: Path to config.yaml

    Returns:
        Configuration dictionary

    Raises:
        FileNotFoundError: If config file does not exist
        yaml.YAMLError: If YAML is malformed
    """
    config_path = Path(config_path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    return config


def setup_logging(log_file: str = None, level: str = "INFO") -> logging.Logger:
    """
    Set up logging with both console and optional file output.

    Args:
        log_file: Optional path to log file
        level: Logging level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        Configured logger
    """
    logger = logging.getLogger("profitleak")
    logger.setLevel(getattr(logging, level))

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, level))
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(getattr(logging, level))
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def safe_divide(numerator: np.ndarray, denominator: np.ndarray,
                fill_value: float = 0.0) -> np.ndarray:
    """
    Safely divide two arrays, replacing division by zero with fill_value.

    Args:
        numerator: Numerator array
        denominator: Denominator array
        fill_value: Value to use when denominator is zero

    Returns:
        Result array with safe division
    """
    with np.errstate(divide='ignore', invalid='ignore'):
        result = np.true_divide(numerator, denominator)
        result = np.where(np.isfinite(result), result, fill_value)
    return result


def safe_divide_series(numerator: pd.Series, denominator: pd.Series,
                       fill_value: float = 0.0) -> pd.Series:
    """
    Safely divide two pandas Series, replacing division by zero with fill_value.

    Args:
        numerator: Numerator Series
        denominator: Denominator Series
        fill_value: Value to use when denominator is zero

    Returns:
        Result Series with safe division
    """
    with np.errstate(divide='ignore', invalid='ignore'):
        result = numerator / denominator
        result = result.fillna(fill_value)
        result = result.replace([np.inf, -np.inf], fill_value)
    return result


def clip_values(series: pd.Series, min_val: float = None,
                max_val: float = None, clip_reason: str = "") -> tuple:
    """
    Clip values in a Series and return clipped Series plus count of clipped values.

    Args:
        series: pandas Series to clip
        min_val: Minimum value (inclusive)
        max_val: Maximum value (inclusive)
        clip_reason: Reason for clipping (for logging)

    Returns:
        Tuple of (clipped_series, num_clipped)
    """
    original = series.copy()
    clipped = series.clip(lower=min_val, upper=max_val)
    num_clipped = (original != clipped).sum()

    if num_clipped > 0:
        logger = logging.getLogger("profitleak")
        logger.warning(
            f"Clipped {num_clipped} values in {series.name}: {clip_reason}"
        )

    return clipped, num_clipped


def get_logger(name: str = "profitleak") -> logging.Logger:
    """Get or create a logger."""
    return logging.getLogger(name)
