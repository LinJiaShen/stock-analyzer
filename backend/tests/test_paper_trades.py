"""
模擬交易測試 — 建立、分批出場、平倉、統計
"""
import pytest


async def _create_trade(client, **overrides):
    # 確保本金足夠（避開單一持股 20% 上限），讓測試聚焦在出場/統計邏輯
    await client.put("/api/paper-trades/account", json={"initial_capital": 10000000})
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
        "exits": [
            {"type": "tp", "seq": 1, "price": 110.0, "quantity": 5},
            {"type": "sl", "seq": 1, "price": 90.0, "quantity": 1},
        ],
    })
    assert res.status_code == 400  # 出場張數超過進場張數


@pytest.mark.asyncio
async def test_stop_loss_required(auth_client):
    """強制停損：沒有 SL 計畫應被拒絕"""
    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 100.0, "quantity": 1,
        "exits": [{"type": "tp", "seq": 1, "price": 110.0, "quantity": 1}],
    })
    assert res.status_code == 400
    assert "停損" in res.json()["detail"]


@pytest.mark.asyncio
async def test_balance_hard_cap(auth_client):
    """餘額硬上限：進場成本超過本金（預設 100 萬）應被拒絕"""
    # 1000 元 × 2 張 × 1000 股 = 200 萬 > 預設本金 100 萬
    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 1000.0, "quantity": 2,
        "exits": [{"type": "sl", "seq": 1, "price": 950.0, "quantity": 2}],
    })
    assert res.status_code == 400
    assert "可用餘額" in res.json()["detail"]


@pytest.mark.asyncio
async def test_account_get_and_update(auth_client):
    # 預設帳戶 100 萬
    res = await auth_client.get("/api/paper-trades/account")
    assert res.status_code == 200
    assert res.json()["initial_capital"] == 1000000

    # 調整本金到 1000 萬
    res = await auth_client.put("/api/paper-trades/account", json={"initial_capital": 10000000})
    assert res.status_code == 200
    assert res.json()["initial_capital"] == 10000000

    # 調本金後可開原本（餘額/部位上限）超限的單：200 萬成本，在 1000 萬本金下符合 20% 單一持股上限
    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 1000.0, "quantity": 2,
        "exits": [{"type": "sl", "seq": 1, "price": 950.0, "quantity": 2}],
    })
    assert res.status_code == 201


@pytest.mark.asyncio
async def test_partial_fill_then_close(auth_client):
    trade = await _create_trade(auth_client)
    trade_id = trade["id"]

    # TP1 成交：100 → 110，1 張，毛利 10,000 扣費後淨值 9,372
    res = await auth_client.post(f"/api/paper-trades/{trade_id}/fill", json={
        "type": "tp", "seq": 1, "filled_price": 110.0, "quantity": 1,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "partial"
    assert body["remaining_quantity"] == 2
    assert body["realized_pnl"] == 9372

    # 手動平倉剩餘 2 張 @105：毛利 10,000 扣費後淨值 8,786 → 累計 18,158
    res = await auth_client.post(f"/api/paper-trades/{trade_id}/fill", json={
        "type": "manual", "filled_price": 105.0, "quantity": 2,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "closed"
    assert body["remaining_quantity"] == 0
    assert body["realized_pnl"] == 18158


@pytest.mark.asyncio
async def test_fill_exceeding_remaining_rejected(auth_client):
    trade = await _create_trade(auth_client)
    res = await auth_client.post(f"/api/paper-trades/{trade['id']}/fill", json={
        "type": "manual", "filled_price": 105.0, "quantity": 99,
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_stats(auth_client):
    sl_only = [{"type": "sl", "seq": 1, "price": 90.0, "quantity": 1}]
    # 一勝：100→110 全平，扣費後淨利 +9,372
    t1 = await _create_trade(auth_client, quantity=1, exits=sl_only)
    await auth_client.post(f"/api/paper-trades/{t1['id']}/fill", json={
        "type": "manual", "filled_price": 110.0, "quantity": 1,
    })
    # 一敗：100→95 全平，扣費後淨損 -5,562
    t2 = await _create_trade(auth_client, quantity=1, exits=sl_only)
    await auth_client.post(f"/api/paper-trades/{t2['id']}/fill", json={
        "type": "manual", "filled_price": 95.0, "quantity": 1,
    })

    res = await auth_client.get("/api/paper-trades/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["closed_trades"] == 2
    assert stats["win_rate"] == 50.0
    assert stats["rr_ratio"] == 1.69          # 9372 / 5562
    assert stats["realized_pnl"] == 3810      # +9372 - 5562
    # EV = 0.5×9372 − 0.5×5562 = 1905
    assert stats["ev"] == 1905


@pytest.mark.asyncio
async def test_delete(auth_client):
    trade = await _create_trade(auth_client)
    res = await auth_client.delete(f"/api/paper-trades/{trade['id']}")
    assert res.status_code == 204
    res = await auth_client.get("/api/paper-trades/")
    assert res.json()["total"] == 0


@pytest.mark.asyncio
async def test_realized_pnl_is_net_of_fees(auth_client):
    """已實現損益應為扣除手續費 + 證交稅後的淨值（< 毛利）"""
    trade = await _create_trade(
        auth_client, quantity=1,
        exits=[{"type": "sl", "seq": 1, "price": 90.0, "quantity": 1}],
    )
    res = await auth_client.post(f"/api/paper-trades/{trade['id']}/fill", json={
        "type": "manual", "filled_price": 110.0, "quantity": 1,
    })
    body = res.json()
    assert body["realized_pnl"] == 9372   # 毛利 10,000 − 來回成本 628
    assert body["realized_pnl"] < 10000


@pytest.mark.asyncio
async def test_position_cap_rejected(auth_client):
    """單一持股上限：預設本金 100 萬、上限 20%（20 萬），成本 30 萬應被擋"""
    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 100.0, "quantity": 3,
        "exits": [{"type": "sl", "seq": 1, "price": 95.0, "quantity": 3}],
    })
    assert res.status_code == 400
    assert "上限" in res.json()["detail"]


@pytest.mark.asyncio
async def test_total_exposure_cap_rejected(auth_client, db):
    """總曝險上限：把上限調低到 5%，成本 10 萬（未觸發單一持股上限）應被總曝險擋下"""
    from sqlalchemy import select
    from app.models.paper_account import PaperAccount

    await auth_client.get("/api/paper-trades/account")  # 確保帳戶已建立
    acc = (await db.execute(select(PaperAccount))).scalar_one()
    acc.max_total_exposure_pct = 5
    await db.commit()

    res = await auth_client.post("/api/paper-trades/", json={
        "stock_code": "2330", "entry_price": 100.0, "quantity": 1,
        "exits": [{"type": "sl", "seq": 1, "price": 95.0, "quantity": 1}],
    })
    assert res.status_code == 400
    assert "曝險" in res.json()["detail"]


# ---------- P1：模式設定 / 半自動確認 / 進階績效 ----------

@pytest.mark.asyncio
async def test_settings_get_and_update(auth_client):
    res = await auth_client.get("/api/paper-trades/settings")
    assert res.status_code == 200
    s = res.json()
    assert s["auto_trade_mode"] == "off"      # 安全預設
    assert s["fee_discount"] == 1.0
    assert s["max_position_pct"] == 20.0

    res = await auth_client.put("/api/paper-trades/settings", json={
        "auto_trade_mode": "auto", "fee_discount": 0.6, "max_positions": 8,
    })
    assert res.status_code == 200
    s = res.json()
    assert s["auto_trade_mode"] == "auto"
    assert s["fee_discount"] == 0.6
    assert s["max_positions"] == 8
    assert s["max_position_pct"] == 20.0       # 未提供的欄位不變


@pytest.mark.asyncio
async def test_confirm_requires_proposed_status(auth_client):
    trade = await _create_trade(auth_client)   # status=open
    res = await auth_client.post(f"/api/paper-trades/{trade['id']}/confirm")
    assert res.status_code == 400
    assert "proposed" in res.json()["detail"]


@pytest.mark.asyncio
async def test_proposed_excluded_then_confirmed(auth_client, db):
    """半自動 proposed 單不計入績效/部位；確認後成為 open 並計入"""
    from sqlalchemy import select
    from app.models.user import User as UserModel
    from app.models.paper_trade import PaperTrade

    user = (await db.execute(select(UserModel).where(UserModel.username == "testuser"))).scalar_one()
    pt = PaperTrade(
        user_id=user.id, stock_code="2330", entry_price=100, quantity=1,
        remaining_quantity=1, status="proposed",
        exits=[{"type": "sl", "seq": 1, "price": 95.0, "quantity": 1}],
    )
    db.add(pt)
    await db.commit()
    await db.refresh(pt)

    stats = (await auth_client.get("/api/paper-trades/stats")).json()
    assert stats["proposed_trades"] == 1
    assert stats["total_trades"] == 0
    assert stats["deployed"] == 0

    res = await auth_client.post(f"/api/paper-trades/{pt.id}/confirm")
    assert res.status_code == 200
    assert res.json()["status"] == "open"

    stats = (await auth_client.get("/api/paper-trades/stats")).json()
    assert stats["proposed_trades"] == 0
    assert stats["open_trades"] == 1
    assert stats["deployed"] == 100000


@pytest.mark.asyncio
async def test_performance_metrics(auth_client):
    """profit factor / 最大連敗 / 最大單筆盈虧 / 夏普 / 平均持有"""
    sl = [{"type": "sl", "seq": 1, "price": 80.0, "quantity": 1}]
    # 勝、敗、敗（依平倉順序 → 最大連敗 2）
    for exit_price in (110.0, 95.0, 90.0):
        t = await _create_trade(auth_client, quantity=1, exits=sl)
        await auth_client.post(f"/api/paper-trades/{t['id']}/fill", json={
            "type": "manual", "filled_price": exit_price, "quantity": 1,
        })
    stats = (await auth_client.get("/api/paper-trades/stats")).json()
    assert stats["closed_trades"] == 3
    assert stats["max_consecutive_losses"] == 2
    assert stats["profit_factor"] == 0.58       # 9372 / (5562 + 10540)
    assert stats["largest_win"] == 9372
    assert stats["largest_loss"] == 10540
    assert stats["sharpe"] is not None
    assert stats["avg_hold_days"] is not None
