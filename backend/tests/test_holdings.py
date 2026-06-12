"""
持股管理測試 — CRUD 與權限隔離
"""
import pytest


@pytest.mark.asyncio
async def test_holdings_requires_auth(client):
    res = await client.get("/api/holdings/")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_and_list_holding(auth_client):
    res = await auth_client.post("/api/holdings/", json={
        "stock_code": "2330",
        "stock_name": "台積電",
        "quantity": 1000,
        "avg_cost": 580.0,
    })
    assert res.status_code == 201, res.text
    holding = res.json()
    assert holding["stock_code"] == "2330"

    res = await auth_client.get("/api/holdings/")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["stock_code"] == "2330"


@pytest.mark.asyncio
async def test_update_holding(auth_client):
    res = await auth_client.post("/api/holdings/", json={
        "stock_code": "2454",
        "stock_name": "聯發科",
        "quantity": 500,
        "avg_cost": 1000.0,
    })
    holding_id = res.json()["id"]

    res = await auth_client.put(f"/api/holdings/{holding_id}", json={"quantity": 800})
    assert res.status_code == 200
    assert float(res.json()["quantity"]) == 800


@pytest.mark.asyncio
async def test_delete_holding(auth_client):
    res = await auth_client.post("/api/holdings/", json={
        "stock_code": "2317",
        "stock_name": "鴻海",
        "quantity": 2000,
        "avg_cost": 100.0,
    })
    holding_id = res.json()["id"]

    res = await auth_client.delete(f"/api/holdings/{holding_id}")
    assert res.status_code == 204

    res = await auth_client.get("/api/holdings/")
    codes = [h["stock_code"] for h in res.json()]
    assert "2317" not in codes


@pytest.mark.asyncio
async def test_cannot_access_other_users_holding(client, auth_client):
    """使用者 A 的持股，使用者 B 不可刪除"""
    res = await auth_client.post("/api/holdings/", json={
        "stock_code": "2308",
        "stock_name": "台達電",
        "quantity": 100,
        "avg_cost": 300.0,
    })
    holding_id = res.json()["id"]

    # 登出 A，註冊登入 B（同一個 client 換身份）
    await client.post("/api/auth/logout")
    client.cookies.clear()
    await client.post("/api/auth/register", json={
        "username": "userb", "email": "userb@test.com", "password": "UserB12345",
    })
    await client.post("/api/auth/login", json={
        "username": "userb", "password": "UserB12345",
    })

    res = await client.delete(f"/api/holdings/{holding_id}")
    assert res.status_code == 404  # B 看不到 A 的持股
