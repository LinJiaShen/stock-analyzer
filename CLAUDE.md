# CLAUDE.md

此文件提供 Claude Code (claude.ai/code) 在此專案中工作時的指引。

## 開發指令

### Docker（建議）
```bash
cp backend/.env.example backend/.env
docker-compose up -d
docker-compose logs -f backend
```

### 後端（本地）
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # 執行於 :8000
```

### 前端（本地）
```bash
cd frontend
npm install
npm run dev    # 執行於 :3000
npm run build
npm run lint
```

### 測試
```bash
cd backend
pytest                          # 所有測試
pytest tests/path/test_file.py  # 單一檔案
pytest -k "test_name"           # 單一測試
```

後端啟動後，API 文件位於 `http://localhost:8000/docs`。

## 架構

本系統為台灣股市分析平台，分為四個層級：

**FastAPI 後端**（`backend/app/`）— 使用 SQLAlchemy + asyncpg 的非同步 API 伺服器。路由組織在 `routers/`，業務邏輯在 `services/`，ORM 模型在 `models/`，Pydantic schema 在 `schemas/`。`main.py` 的 lifespan handler 在啟動時執行 DB 初始化。

**Worker 服務**（`backend/worker/`）— 獨立程序（執行指令：`python -m worker.main`），負責所有資料抓取：TWSE 爬蟲、Yahoo Finance、新聞爬蟲與情緒分析。刻意與 FastAPI 程序分離，避免 APScheduler 排程抖動影響 API 回應時間。

**Next.js 前端**（`frontend/src/`）— 使用 App Router，以 React Query（`@tanstack/react-query`）管理伺服器狀態。API 客戶端為 `src/lib/api.ts`（Axios），Hooks 在 `src/hooks/useApi.ts`，TypeScript 型別定義在 `src/types/index.ts`。圖表使用 Recharts，樣式使用 Tailwind CSS v4。**注意**：本專案使用 Next.js 16，修改 Next.js 相關程式碼前請先閱讀 `node_modules/next/dist/docs/`，API 可能與訓練資料有所差異。

**資料庫** — PostgreSQL + TimescaleDB 處理關聯與時間序列資料。TimescaleDB hypertable：`daily_bars`（按 `trade_date` 分區）、`minute_bars`（按 `bar_time`）、`chip_data`（按 `trade_date`）、`sentiment_data`（按 `time`）。Redis 負責 TWSE 速率限制防護與 LLM 推論結果快取。

## 重要設計決策

**Admin 路由跳過認證** — `ENV=development` 時，`routers/admin.py` 會略過 JWT 驗證。正式環境下所有 admin 端點均需 JWT token。

**技術指標使用 `adjusted_close`** — `daily_bars` 同時儲存 `close_price`（原始）與 `adjusted_close`（還原權值）。MA、RSI、MACD 等所有技術指標計算必須使用 `adjusted_close`，避免除權息造成訊號失真。

**TWSE 速率限制** — 官方 TWSE API 有嚴格阻斷機制。`worker/twse_worker.py` 必須使用 Redis 快取結果、隨機延遲與指數退避重試。初期歷史數據優先使用 Yahoo Finance 打底，降低對 TWSE 的依賴。

**LLM 整合** — Ollama 在本地執行（預設模型：`qwen:7b`）。務必使用 `format=json` 模式確保輸出結構穩定。推論結果快取至 Redis 避免重複運算。Docker 環境中 `OLLAMA_BASE_URL` 指向 `host.docker.internal:11434`。

**多因子評分權重** — 技術面 30%、籌碼面 30%、基本面 20%、情緒面 20%。完整因子細項請參考 `plans/architecture.md` §6.1，對應實作在 `services/scoring.py`。

**資料庫 Session** — 所有 router 均透過 `app/database.py` 的 `get_db()` 依賴注入取得 session。Session factory 設定 `expire_on_commit=False` 以符合非同步使用需求。
