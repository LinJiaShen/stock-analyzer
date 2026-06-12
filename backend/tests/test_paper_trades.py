"""
模擬交易測試 — 建立、分批出場、平倉、統計
"""
import pytest


async def _create_trade(client, **overrides):
    payload = {
        "stock_code": "2330",
        "stock_name": "台積電",
        "strategy": "中期極波動",
        "entry_price": 100.0,
        "quantity": 3,
        "exits": [
            {"type": "tp", "seq": 1, "price": 110.0, "quantity": 1},
            {"type": "tp", "seq": 2, "price": 120.0, "quantity": 1},
            {"type": "sl", "seq": 1, "price": 90.0, "quantity": 3},
        ],
        **overrides,
    }
    res = await client.post("/api/paper-trades/", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_requires_auth(client):
    res = await client.get("/api/paper-trades/")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_and_list(auth_client):
    trade = await _create_trade(auth_client)
    assert trade["status"] == "open"
    assert trade["remaining_quantity"] == 3
    assert len(trade["exits"]) == 3

    res = await auth_client.get("/api/paper-trades/")
    assert res.status_code == 200
    assert res.json()["total"] == 1


@pytest.mark.asyncio
async def test_exit_quantity_validation(auth_client):
    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 100.0, "quantity": 1,
        "exits": [{"type": "tp", "seq": 1, "price": 110.0, "quantity": 5}],
    })
    assert res.status_code == 400  # 出場張數超過進場張數


@pytest.mark.asyncio
async def test_partial_fill_then_close(auth_client):
    trade = await _create_trade(auth_client)
    trade_id = trade["id"]

    # TP1 成交：100 → 110，1 張 = +10,000 元
    res = await auth_client.post(f"/api/paper-trades/{trade_id}/fill", json={
        "type": "tp", "seq": 1, "filled_price": 110.0, "quantity": 1,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "partial"
    assert body["remaining_quantity"] == 2
    assert body["realized_pnl"] == 10000

    # 手動平倉剩餘 2 張 @105 = +10,000 元
    res = await auth_client.post(f"/api/paper-trades/{trade_id}/fill", json={
        "type": "manual", "filled_price": 105.0, "quantity": 2,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "closed"
    assert body["remaining_quantity"] == 0
    assert body["realized_pnl"] == 20000


@pytest.mark.asyncio
async def test_fill_exceeding_remaining_rejected(auth_client):
    trade = await _create_trade(auth_client)
    res = await auth_client.post(f"/api/paper-trades/{trade['id']}/fill", json={
        "type": "manual", "filled_price": 105.0, "quantity": 99,
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_stats(auth_client):
    # 一勝：100→110 全平 +10000/張 ×1
    t1 = await _create_trade(auth_client, quantity=1, exits=[])
    await auth_client.post(f"/api/paper-trades/{t1['id']}/fill", json={
        "type": "manual", "filled_price": 110.0, "quantity": 1,
    })
    # 一敗：100→95 全平 -5000/張 ×1
    t2 = await _create_trade(auth_client, quantity=1, exits=[])
    await auth_client.post(f"/api/paper-trades/{t2['id']}/fill", json={
        "type": "manual", "filled_price": 95.0, "quantity": 1,
    })

    res = await auth_client.get("/api/paper-trades/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["closed_trades"] == 2
    assert stats["win_rate"] == 50.0
    assert stats["rr_ratio"] == 2.0           # 10000 / 5000
    assert stats["realized_pnl"] == 5000      # +10000 - 5000
    # EV = 0.5×10000 − 0.5×5000 = 2500
    assert stats["ev"] == 2500


@pytest.mark.asyncio
async def test_delete(auth_client):
    trade = await _create_trade(auth_client)
    res = await auth_client.delete(f"/api/paper-trades/{trade['id']}")
    assert res.status_code == 204
    res = await auth_client.get("/api/paper-trades/")
    assert res.json()["total"] == 0
