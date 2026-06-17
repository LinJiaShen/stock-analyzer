"""
自訂預警：規則判定（純函式）+ CRUD 端點
"""
import pytest

from worker.alert_worker import evaluate_rule


# ---------- 規則判定 ----------

def test_breakout():
    closes = [10] * 19 + [9, 12]   # 末值 12 創前 20 日新高
    assert evaluate_rule("breakout", {"lookback": 20}, closes, [], 0) is not None


def test_price_above_crosses():
    assert evaluate_rule("price_above", {"threshold": 100}, [99, 101], [], 0) is not None
    assert evaluate_rule("price_above", {"threshold": 100}, [101, 102], [], 0) is None  # 已在上方


def test_volume_spike():
    vols = [1000] * 20 + [3000]
    assert evaluate_rule("volume_spike", {"lookback": 20, "multiplier": 1.5}, [10] * 21, vols, 0) is not None


def test_ma_break_below():
    closes = [10] * 20 + [8]       # 由 10 跌破 20 日均線
    assert evaluate_rule("ma_break_below", {"ma": 20}, closes, [], 0) is not None


def test_foreign_streak():
    assert evaluate_rule("foreign_streak", {"days": 3}, [10, 11], [], 5) is not None
    assert evaluate_rule("foreign_streak", {"days": 3}, [10, 11], [], 2) is None


# ---------- CRUD ----------

@pytest.mark.asyncio
async def test_alert_crud(auth_client):
    res = await auth_client.post("/api/alerts/", json={
        "stock_code": "2330", "stock_name": "台積電",
        "rule_type": "breakout", "params": {"lookback": 20},
    })
    assert res.status_code == 201, res.text
    rid = res.json()["id"]
    assert res.json()["enabled"] is True

    assert len((await auth_client.get("/api/alerts/")).json()["rules"]) == 1

    res = await auth_client.put(f"/api/alerts/{rid}/toggle")
    assert res.json()["enabled"] is False

    # 不合法 rule_type → 422
    res = await auth_client.post("/api/alerts/", json={"stock_code": "2330", "rule_type": "bogus", "params": {}})
    assert res.status_code == 422

    res = await auth_client.delete(f"/api/alerts/{rid}")
    assert res.status_code == 204
    assert len((await auth_client.get("/api/alerts/")).json()["rules"]) == 0
