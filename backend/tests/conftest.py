"""
pytest fixtures — 測試資料庫、HTTP client、測試使用者

測試 DB 使用獨立的 test_stock_analyzer（每個測試重建 schema），
不會碰到開發/正式資料。

執行方式（容器內）:
    docker compose exec backend pytest tests/ -v
"""
import os

# 測試環境強制清空 Cookie domain：容器 .env 可能設了 COOKIE_DOMAIN=.tstock.uk（跨 subdomain
# 正式設定），會讓 secure cookie 綁到該網域，httpx 測試 client（host=test、http）收不到 auth
# cookie 而一律 401。必須在 import app 之前覆蓋環境變數（settings 於 import 時建構並 lru_cache）。
os.environ["COOKIE_DOMAIN"] = ""

# 容器內 host 為 db；本機執行設 TEST_DB_HOST=localhost
_DB_HOST = os.environ.get("TEST_DB_HOST", "db")
TEST_DATABASE_URL = f"postgresql+asyncpg://postgres:postgres@{_DB_HOST}:5432/test_stock_analyzer"

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import Base, get_db
from app.utils.ratelimit import limiter

# 測試時關閉速率限制（避免多次登入觸發 429）
limiter.enabled = False


@pytest_asyncio.fixture
async def db():
    """每個測試獨立 engine（避免跨 event loop 連線）+ 乾淨 schema"""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db):
    """注入測試 DB 的 HTTP client"""
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client):
    """已註冊並登入的 client（帶 Cookie）"""
    await client.post("/api/auth/register", json={
        "username": "testuser",
        "email": "testuser@test.com",
        "password": "Test12345!",
    })
    res = await client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "Test12345!",
    })
    assert res.status_code == 200, f"登入失敗: {res.text}"
    # httpx 會自動保留 Set-Cookie 到後續請求
    return client
