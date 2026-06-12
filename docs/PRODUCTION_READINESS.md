# 上線前必修清單

> 審查日期：2026-06-11  
> 審查人：資深全端工程師  
> 結論：**尚不可上線** — 5 個 Critical 問題必須修復，其餘為 High/Medium 優先

---

## 總覽

| 分類 | 狀態 | 優先級 |
|------|------|--------|
| 認證安全 | 🔴 有漏洞 | Critical |
| 資料庫遷移 | 🔴 缺失 | Critical |
| 設定驗證 | 🔴 有漏洞 | Critical |
| 測試覆蓋 | 🔴 0% | High |
| 錯誤追蹤 | 🔴 缺失 | High |
| 正式部署設定 | 🟡 不完整 | High |
| 前端安全 | 🟡 有風險 | High |
| 功能完成度 | 🟡 部分未實作 | Medium |

---

## 🔴 Critical — 必須修復才能上線

---

### C1. 資料庫遷移系統（Alembic）缺失

**問題**  
目前所有表格在 app 啟動時用 `Base.metadata.create_all()` 建立（`database.py:43`）。這在 schema 需要變更時會造成以下問題：
- 無法安全加欄位、改欄位型別
- 無版本歷史，不能 rollback
- 多人同時開發 schema 衝突無法解決

`requirements.txt` 中雖然有 `alembic`，但整個 `alembic/` 目錄不存在。

**實作步驟**

```bash
cd backend
pip install alembic
alembic init alembic
```

修改 `alembic/env.py`：
```python
# alembic/env.py
from app.database import Base
from app.models import *  # 確保所有 model 被 import

target_metadata = Base.metadata

# 修改 get_url() 使用 settings
from app.config import settings
def get_url():
    return settings.DATABASE_URL_SYNC  # 用同步版本的 DB URL
```

建立第一版 migration：
```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

**之後每次改 model：**
```bash
alembic revision --autogenerate -m "add xxx column"
alembic upgrade head
```

從 `main.py` 的 lifespan 移除 `create_all()`，改成：
```python
# 不要在 main.py 用 create_all()，用 alembic 管理
# await init_db() 只負責建立連線池，不建表
```

---

### C2. 認證安全漏洞

**問題 1：時序攻擊（User Enumeration）**  
`backend/app/routers/auth.py` 的登入邏輯：
```python
# 現在的代碼（有問題）
user = await get_user_by_username(db, login_data.username)
if not user or not verify_password(login_data.password, user.password_hash):
    raise HTTPException(...)
```
若帳號不存在，回應時間比帳號存在但密碼錯誤短很多（少了 bcrypt hash 計算）。攻擊者可以枚舉有效帳號。

**修復方式：**
```python
# backend/app/routers/auth.py
DUMMY_HASH = "$2b$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxx"

user = await get_user_by_username(db, login_data.username)
if not user:
    # 故意執行一次 bcrypt，讓回應時間一致
    verify_password("dummy", DUMMY_HASH)
    raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
if not verify_password(login_data.password, user.password_hash):
    raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
```

**問題 2：開發環境繞過認證**  
`backend/app/routers/holdings.py:22`：
```python
async def get_optional_user():
    if settings.ENV == "development":
        return None  # 完全跳過認證
```
若開發機器暴露在外網，整個 API 完全無防護。

**修復方式：**
```python
# 移除 get_optional_user()，改用真正的認證
# 若需要在開發時測試，使用測試帳號登入

@router.get("/", response_model=List[HoldingResponse])
async def get_holdings(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),  # 恢復強制認證
    db: AsyncSession = Depends(get_db)
):
```

**問題 3：登入/註冊端點無速率限制**  
任何人可以無限次嘗試密碼。

**修復方式（安裝 slowapi）：**
```bash
pip install slowapi
```
```python
# backend/app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# backend/app/routers/auth.py
from app.main import limiter

@router.post("/login")
@limiter.limit("5/minute")  # 每 IP 每分鐘最多 5 次
async def login(request: Request, ...):
    ...
```

---

### C3. 設定驗證 — 不安全預設值

**問題**  
`backend/app/config.py` 含有不安全的預設值：
```python
JWT_SECRET: str = "your-secret-key-change-in-production"  # 弱預設
```
若 `.env` 沒有設定，production 會用這個 key。所有 JWT 都能被預測。

**修復方式：**
```python
# backend/app/config.py
from pydantic import field_validator

class Settings(BaseSettings):
    JWT_SECRET: str = "REPLACE_ME"
    ENV: str = "development"

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v, info):
        env = info.data.get("ENV", "development")
        if env == "production" and v in ("REPLACE_ME", "your-secret-key-change-in-production", "change-me-in-production"):
            raise ValueError("生產環境必須設定強 JWT_SECRET，不能使用預設值")
        if len(v) < 32:
            raise ValueError("JWT_SECRET 長度至少 32 字元")
        return v

    @field_validator("DB_PASSWORD")
    @classmethod
    def validate_db_password(cls, v, info):
        env = info.data.get("ENV", "development")
        if env == "production" and v == "postgres":
            raise ValueError("生產環境不能使用預設資料庫密碼 'postgres'")
        return v
```

另外 `docker-compose.yml` 加上 restart policy 和資源限制：
```yaml
services:
  backend:
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
  
  db:
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set}  # 強制要求設定
```

---

### C4. 錯誤追蹤與結構化日誌

**問題**  
目前使用 `print()` 和零散的 `logging.getLogger()`。線上發生的 exception 無任何通知，無法追蹤。

**實作步驟**

安裝 Sentry SDK：
```bash
pip install sentry-sdk[fastapi]
```

在 `backend/app/main.py` 加入：
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        environment=settings.ENV,
    )
```

在 `config.py` 加入：
```python
SENTRY_DSN: str = ""  # 留空則不啟用
```

加入請求 logging middleware：
```python
# backend/app/middleware/logging.py
import time, logging
from fastapi import Request

logger = logging.getLogger("api.access")

async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)
    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} duration={duration}ms "
        f"ip={request.client.host}"
    )
    return response

# 在 main.py 加入
app.middleware("http")(log_requests)
```

---

### C5. 前端 Token 儲存安全

**問題**  
`frontend/src/lib/api.ts` 把 JWT 存在 `localStorage`。XSS 攻擊可以竊取所有 token。

**修復方式：換成 HttpOnly Cookie**

這需要前後端同時改動：

**後端 `auth.py` 改成 Set-Cookie：**
```python
from fastapi.responses import JSONResponse

@router.post("/login")
async def login(response: Response, login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # ... 驗證邏輯 ...
    access_token = create_access_token({"sub": str(user.id)})
    
    response = JSONResponse(content={"username": user.username, "message": "登入成功"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,       # 無法被 JS 讀取
        secure=True,         # 只透過 HTTPS 傳送（生產環境）
        samesite="lax",      # CSRF 基本防護
        max_age=86400,       # 24 小時
    )
    return response
```

**後端 `security.py` 改從 Cookie 讀取：**
```python
from fastapi import Cookie

async def get_current_user(
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if not access_token:
        raise HTTPException(status_code=401, detail="未登入")
    # ... 原本的 JWT 解碼邏輯 ...
```

**前端 `api.ts` 移除手動 token 管理：**
```typescript
// 移除所有 localStorage.getItem("token") 的 Authorization header
// Axios 自動帶 cookie（需設定 withCredentials）
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  withCredentials: true,  // 帶 cookie
});
// 移除 request interceptor 中的 Authorization header 注入
```

---

## 🟡 High — 強烈建議上線前完成

---

### H1. 測試覆蓋

**現狀：0% 覆蓋率**

最低限度測試套件位置：`backend/tests/`

需要的測試檔案：

```
backend/tests/
├── conftest.py          # pytest fixtures (test DB, client, user)
├── test_auth.py         # 登入、註冊、token 驗證
├── test_holdings.py     # CRUD 操作、權限驗證
├── test_scoring.py      # 評分邏輯正確性
└── test_stocks.py       # K線、籌碼 endpoint
```

`conftest.py` 最小範例：
```python
import pytest, pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.main import app
from app.database import Base, get_db

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/test_stock"

@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def client(db):
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

`test_auth.py` 最小範例：
```python
@pytest.mark.asyncio
async def test_register_and_login(client):
    # 註冊
    res = await client.post("/api/auth/register", json={
        "username": "testuser", "email": "test@test.com", "password": "Test1234!"
    })
    assert res.status_code == 201

    # 登入
    res = await client.post("/api/auth/login", json={
        "username": "testuser", "password": "Test1234!"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()

@pytest.mark.asyncio
async def test_login_wrong_password(client):
    res = await client.post("/api/auth/login", json={
        "username": "testuser", "password": "wrong"
    })
    assert res.status_code == 401

@pytest.mark.asyncio
async def test_timing_attack_resistance(client):
    import time
    # 不存在帳號的回應時間應與密碼錯誤相近
    t1 = time.time()
    await client.post("/api/auth/login", json={"username": "nonexistent", "password": "x"})
    t_nonexistent = time.time() - t1

    t2 = time.time()
    await client.post("/api/auth/login", json={"username": "testuser", "password": "wrong"})
    t_wrong_pw = time.time() - t2

    # 差距不超過 100ms（bcrypt 通常 ~200ms）
    assert abs(t_nonexistent - t_wrong_pw) < 0.1
```

---

### H2. 正式環境 Docker Compose 設定

建立 `docker-compose.prod.yml`：

```yaml
# docker-compose.prod.yml
version: "3.9"

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - certbot_www:/var/www/certbot
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      ENV: production
      DATABASE_URL: ${DATABASE_URL:?required}
      JWT_SECRET: ${JWT_SECRET:?required}
      REDIS_URL: ${REDIS_URL:?required}
      SENTRY_DSN: ${SENTRY_DSN:-}
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?required}
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

  db:
    image: timescale/timescaledb:latest-pg15
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:?required}
      POSTGRES_USER: ${DB_USER:?required}
      POSTGRES_PASSWORD: ${DB_PASSWORD:?required}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2G

volumes:
  postgres_data:
  certbot_www:
```

`nginx/nginx.conf`：
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # 前端
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 後端 API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

### H3. 未實作的功能

以下功能在前端有入口但後端回傳 placeholder：

**1. 持倉健診（`GET /api/holdings/diagnosis`）**  
檔案：`backend/app/routers/holdings.py` 約 149-181 行  
目前回傳：`{"message": "健診功能開發中..."}`

實作建議：
- 對持倉中每支股票呼叫 `ScoringService.calculate_composite_score()`
- 彙整各股評分、建議操作
- 若有 Ollama，用 LLM 生成摘要段落
- 無 LLM 時，用模板文字生成（rule-based）

**2. 籌碼 TWSE 爬蟲（`worker/twse_worker.py`）**  
目前 Worker 有 TWSE 排程但實際 `fetch_all_stocks_daily()` 邏輯未確認完整。  
需確認：
- TWSE 爬蟲是否能正確解析三大法人數據存入 `ChipData`
- 排程是否在 Docker 環境正確觸發
- 測試方式：`docker-compose exec backend python -c "import asyncio; from worker.twse_worker import fetch_all_stocks_daily; asyncio.run(fetch_all_stocks_daily())"`

---

## 🟢 建議（中長期）

| 項目 | 說明 |
|------|------|
| 資料庫備份 | 設定 PostgreSQL WAL 歸檔 + 每日備份到 S3 |
| CI/CD | GitHub Actions 跑測試 + 自動部署 |
| 效能測試 | 用 locust 模擬 100 個並發用戶 |
| Token Refresh | 加入 refresh token 機制，access token 改為 15 分鐘 |
| Email 驗證 | 註冊後發送確認信（用 SendGrid 或 AWS SES） |
| 軟刪除 | User/Holding 改為 soft-delete（加 `deleted_at` 欄位）|
| API 文件 | `/docs` 已有 Swagger，補上各端點的 response example |

---

## 快速檢查腳本

在 `scripts/check-production-ready.sh`：
```bash
#!/bin/bash
echo "=== Production Readiness Check ==="
FAIL=0

# 1. JWT_SECRET
if [ "$JWT_SECRET" = "your-secret-key-change-in-production" ] || [ -z "$JWT_SECRET" ]; then
  echo "❌ JWT_SECRET not set or using default"
  FAIL=1
else
  echo "✅ JWT_SECRET is set"
fi

# 2. DB_PASSWORD
if [ "$DB_PASSWORD" = "postgres" ] || [ -z "$DB_PASSWORD" ]; then
  echo "❌ DB_PASSWORD not set or using default 'postgres'"
  FAIL=1
else
  echo "✅ DB_PASSWORD is set"
fi

# 3. ENV
if [ "$ENV" = "production" ]; then
  echo "✅ ENV=production"
else
  echo "⚠️  ENV=$ENV (not production)"
fi

# 4. Migrations
if [ -f "backend/alembic.ini" ]; then
  echo "✅ Alembic initialized"
else
  echo "❌ Alembic not initialized — run: cd backend && alembic init alembic"
  FAIL=1
fi

# 5. Tests
TEST_COUNT=$(find backend/tests -name "test_*.py" 2>/dev/null | wc -l)
if [ "$TEST_COUNT" -gt 0 ]; then
  echo "✅ Tests found ($TEST_COUNT files)"
else
  echo "❌ No test files found in backend/tests/"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "✅ All critical checks passed"
else
  echo ""
  echo "❌ Fix the above issues before deploying to production"
  exit 1
fi
```

---

## 負責人分工建議

| 任務 | 預估工時 | 技能要求 |
|------|----------|----------|
| C1 Alembic 遷移 | 4h | Python/SQLAlchemy |
| C2 認證安全修復 | 3h | Python/FastAPI |
| C3 設定驗證 | 2h | Python/Pydantic |
| C4 Sentry + 日誌 | 3h | Python/DevOps |
| C5 HttpOnly Cookie | 6h | Python + TypeScript |
| H1 測試套件 | 8h | pytest/pytest-asyncio |
| H2 Nginx + HTTPS | 4h | DevOps/Nginx |
| H3 持倉健診 | 8h | Python/LLM |

**最短上線路徑（只修 Critical）：約 18 人時**
