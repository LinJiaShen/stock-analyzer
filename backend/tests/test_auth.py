"""
認證流程測試 — 註冊、登入、Cookie、時序攻擊防護
"""
import time
import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    res = await client.post("/api/auth/register", json={
        "username": "alice",
        "email": "alice@test.com",
        "password": "Alice12345",
    })
    assert res.status_code == 201
    body = res.json()
    assert body["username"] == "alice"
    assert "password" not in body
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_register_short_password_rejected(client):
    res = await client.post("/api/auth/register", json={
        "username": "bob",
        "email": "bob@test.com",
        "password": "short",
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_register_duplicate_username(client):
    payload = {"username": "carol", "email": "carol@test.com", "password": "Carol12345"}
    res1 = await client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201
    res2 = await client.post("/api/auth/register", json={
        **payload, "email": "carol2@test.com",
    })
    assert res2.status_code == 400


@pytest.mark.asyncio
async def test_login_sets_httponly_cookie(client):
    await client.post("/api/auth/register", json={
        "username": "dave", "email": "dave@test.com", "password": "Dave123456",
    })
    res = await client.post("/api/auth/login", json={
        "username": "dave", "password": "Dave123456",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()
    # Cookie 必須是 HttpOnly
    set_cookie = res.headers.get("set-cookie", "")
    assert "access_token=" in set_cookie
    assert "HttpOnly" in set_cookie


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json={
        "username": "erin", "email": "erin@test.com", "password": "Erin123456",
    })
    res = await client.post("/api/auth/login", json={
        "username": "erin", "password": "wrong-password",
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    res = await client.post("/api/auth/login", json={
        "username": "ghost-user-404", "password": "whatever123",
    })
    assert res.status_code == 401
    # 錯誤訊息不能洩漏帳號是否存在
    assert "使用者名稱或密碼錯誤" in res.json()["detail"]


@pytest.mark.asyncio
async def test_timing_attack_resistance(client):
    """帳號不存在 vs 密碼錯誤的回應時間差應小於 150ms"""
    await client.post("/api/auth/register", json={
        "username": "frank", "email": "frank@test.com", "password": "Frank12345",
    })

    # 預熱（排除首次連線開銷）
    await client.post("/api/auth/login", json={"username": "frank", "password": "x" * 10})

    t1 = time.monotonic()
    await client.post("/api/auth/login", json={"username": "no-such-user-xyz", "password": "x" * 10})
    t_nonexistent = time.monotonic() - t1

    t2 = time.monotonic()
    await client.post("/api/auth/login", json={"username": "frank", "password": "x" * 10})
    t_wrong_pw = time.monotonic() - t2

    assert abs(t_nonexistent - t_wrong_pw) < 0.15, (
        f"時序差過大: 不存在={t_nonexistent:.3f}s vs 密碼錯={t_wrong_pw:.3f}s"
    )


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    res = await client.get("/api/auth/me")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_me_with_cookie(auth_client):
    res = await auth_client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "testuser"


@pytest.mark.asyncio
async def test_logout_clears_cookie(auth_client):
    res = await auth_client.post("/api/auth/logout")
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie", "")
    # 清除 cookie（Max-Age=0 或 expires 過去時間）
    assert "access_token=" in set_cookie
