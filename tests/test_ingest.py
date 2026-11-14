"""
Tests for ingest module: data loading and validation.
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path
from profitleak.ingest import load_data, validate_columns, log_ingestion_summary


@pytest.fixture
def sample_csv(tmp_path):
    """Create a sample CSV file for testing."""
    df = pd.DataFrame({
        "Order ID": ["ORD-001", "ORD-002", "ORD-003"],
        "Sales": [100.0, 200.0, 150.0],
        "Quantity": [1, 2, 1],
        "Discount": [0.1, 0.2, 0.0],
    })
    csv_path = tmp_path / "test_orders.csv"
    df.to_csv(csv_path, index=False)
    return str(csv_path)


def test_load_data_csv(sample_csv):
    """Test loading a CSV file."""
    df = load_data(sample_csv)
    assert len(df) == 3
    assert list(df.columns) == ["Order ID", "Sales", "Quantity", "Discount"]


def test_load_data_missing_file():
    """Test loading a non-existent file raises FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        load_data("non_existent_file.csv")


def test_validate_columns_success():
    """Test column validation when all required columns exist."""
    df = pd.DataFrame({
        "Order ID": [1, 2],
        "Sales": [100, 200],
        "Quantity": [1, 2],
    })
    is_valid, msg = validate_columns(df, {"Order ID", "Sales", "Quantity"})
    assert is_valid is True
    assert msg == ""


def test_validate_columns_missing():
    """Test column validation when required columns are missing."""
    df = pd.DataFrame({
        "Order ID": [1, 2],
        "Sales": [100, 200],
    })
    is_valid, msg = validate_columns(df, {"Order ID", "Sales", "Quantity", "Discount"})
    assert is_valid is False
    assert "Quantity" in msg and "Discount" in msg


def test_load_data_with_usecols(sample_csv):
    """Test loading specific columns."""
    df = load_data(sample_csv, usecols={"Order ID", "Sales"})
    assert set(df.columns) == {"Order ID", "Sales"}


def test_log_ingestion_summary(sample_csv, caplog):
    """Test that ingestion summary is logged."""
    import logging
    caplog.set_level(logging.INFO)

    df = load_data(sample_csv)
    log_ingestion_summary(df, sample_csv)
    # Check that log contains expected information (rows count or similar)
    log_output = caplog.text.lower()
    assert "rows" in log_output or "3" in log_output or "ingest" in log_output
