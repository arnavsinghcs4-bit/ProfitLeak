"""
API integration tests for ProfitLeak FastAPI endpoints.
Tests ingestion, validation, analysis pipeline execution,
aggregation queries, filtering, reporting, and settings management.
"""

import io
import pytest
from fastapi.testclient import TestClient
from api.app import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "assumptions" in data
    assert data["assumptions"]["unit_cost_pct_of_sales"] == 0.40


def test_sample_load_and_analysis_flow():
    # 1. Load sample data
    load_res = client.post("/api/sample/load")
    assert load_res.status_code == 200
    session_id = load_res.json()["session_id"]
    assert session_id is not None
    assert load_res.json()["meta"]["status"] == "ready"
    assert load_res.json()["meta"]["row_count"] == 10000

    # 2. Run analysis
    analyze_res = client.post(f"/api/datasets/{session_id}/analyze", json={"session_id": session_id, "generate_reports": True})
    assert analyze_res.status_code == 200
    assert analyze_res.json()["meta"]["status"] == "analyzed"

    # 3. Check summary metrics
    summary_res = client.get(f"/api/datasets/{session_id}/summary")
    assert summary_res.status_code == 200
    s = summary_res.json()["summary"]
    assert s["orders"] == 10000
    assert pytest.approx(s["gross_sales"], rel=1e-2) == 7833233.11
    assert pytest.approx(s["net_revenue"], rel=1e-2) == 6825535.55
    assert pytest.approx(s["net_profit"], rel=1e-2) == 1788182.65
    assert s["loss_orders"] == 842
    assert pytest.approx(s["overall_margin"], rel=1e-2) == 0.2619 or pytest.approx(s["avg_order_margin"], rel=1e-2) == 0.2443
    assert pytest.approx(s["breakeven_discount"], rel=1e-2) == 0.3631

    # 4. Check time series
    ts_res = client.get(f"/api/datasets/{session_id}/timeseries?granularity=month")
    assert ts_res.status_code == 200
    points = ts_res.json()["points"]
    assert len(points) > 0
    assert "period" in points[0]
    assert "gross_sales" in points[0]

    # 5. Check category-region heatmap
    hm_res = client.get(f"/api/datasets/{session_id}/heatmap")
    assert hm_res.status_code == 200
    hm = hm_res.json()
    assert len(hm["categories"]) > 0
    assert len(hm["regions"]) > 0
    assert len(hm["cells"]) > 0

    # 6. Check scatter
    sc_res = client.get(f"/api/datasets/{session_id}/scatter")
    assert sc_res.status_code == 200
    sc = sc_res.json()
    assert len(sc["points"]) > 0
    assert sc["breakeven_discount"] is not None

    # 7. Check discount bands
    db_res = client.get(f"/api/datasets/{session_id}/discount-bands")
    assert db_res.status_code == 200
    bands = db_res.json()["bands"]
    assert len(bands) > 0
    assert any(b["band"] == "0%" for b in bands)

    # 8. Check loss causes
    lc_res = client.get(f"/api/datasets/{session_id}/loss-causes")
    assert lc_res.status_code == 200
    causes = lc_res.json()["causes"]
    assert len(causes) > 0
    cause_names = [c["cause"] for c in causes]
    assert "Both" in cause_names or "Shipping-driven" in cause_names

    # 9. Query loss orders with sorting & pagination
    lo_res = client.get(f"/api/datasets/{session_id}/loss-orders?sort_by=net_profit&sort_dir=asc&page=1&page_size=20")
    assert lo_res.status_code == 200
    lo = lo_res.json()
    assert lo["total_matches"] == 842
    assert len(lo["rows"]) == 20
    first_order_id = lo["rows"][0]["order_id"]

    # 10. Order detail drawer endpoint
    detail_res = client.get(f"/api/datasets/{session_id}/orders/{first_order_id}")
    assert detail_res.status_code == 200
    order_data = detail_res.json()["order"]
    assert order_data["order_id"] == first_order_id
    assert order_data["is_loss"] is True
    assert "metric_definitions" in detail_res.json()

    # 11. Products ranking
    prod_res = client.get(f"/api/datasets/{session_id}/products?sort_by=net_profit&sort_dir=desc&limit=10")
    assert prod_res.status_code == 200
    prods = prod_res.json()["rows"]
    assert len(prods) == 10

    # 12. Breakdown by category
    bd_res = client.get(f"/api/datasets/{session_id}/breakdown/category")
    assert bd_res.status_code == 200
    bd = bd_res.json()["rows"]
    assert len(bd) > 0

    # 13. Reports list
    rep_res = client.get(f"/api/datasets/{session_id}/reports")
    assert rep_res.status_code == 200
    reports = rep_res.json()["reports"]
    assert any(r["key"] == "cleaned_orders" for r in reports)

    # 14. Cleanup
    del_res = client.delete(f"/api/datasets/{session_id}")
    assert del_res.status_code == 200


def test_upload_preview_and_validation():
    csv_content = b"Order ID,Sales,Discount,Quantity,Category\nORD-1,100.0,0.1,1,Technology\nORD-2,200.0,0.5,2,Furniture\n"
    files = {"file": ("test_orders.csv", io.BytesIO(csv_content), "text/csv")}
    res = client.post("/api/upload", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["row_count"] == 2
    assert "sales" in data["suggested_mapping"]
    assert data["suggested_mapping"]["sales"] == "Sales"


def test_settings_get_and_put():
    # Get settings
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    cfg = get_res.json()["config"]
    assert "finance" in cfg

    # Test invalid update (negative percentage)
    bad_res = client.put("/api/settings", json={"finance": {"unit_cost_pct_of_sales": -0.5}})
    assert bad_res.status_code == 422

    # Test valid update
    current_unit_cost = cfg.get("finance", {}).get("unit_cost_pct_of_sales", 0.40)
    new_unit_cost = 0.42
    put_res = client.put("/api/settings", json={"finance": {"unit_cost_pct_of_sales": new_unit_cost}})
    assert put_res.status_code == 200
    assert put_res.json()["config"]["finance"]["unit_cost_pct_of_sales"] == 0.42

    # Revert back to original
    client.put("/api/settings", json={"finance": {"unit_cost_pct_of_sales": current_unit_cost}})
