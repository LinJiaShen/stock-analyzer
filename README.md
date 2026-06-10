# 股票分析系統

整合量化交易與系統化投資的股票分析平台。

## 技術架構

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端框架** | Next.js 16+ (App Router + Turbopack) | React 生態系，SSR/SSG 支援 |
| **前端圖表** | Recharts | K線圖、雷達圖、量價分析 |
| **狀態管理** | @tanstack/react-query | 伺服器狀態管理 + 快取 |
| **後端框架** | Python FastAPI (asyncpg) | 高效能 async API |
| **資料庫** | PostgreSQL + TimescaleDB | 時間序列資料庫 |
| **快取** | Redis | 快取 + 速率限制 |
| **AI** | Ollama (qwen/gemma) | 本地 LLM 情緒分析 |
| **部署** | Docker Compose | 容器化開發與部署 |

## 快速開始

### 環境需求

- Docker & Docker Compose
- Python 3.11+ (本地開發)
- Node.js 18+ (本地開發)

### 使用 Docker 啟動

```bash
# 1. 複製環境設定
cp backend/.env.example backend/.env

# 2. 啟動所有服務
docker-compose up -d

# 3. 查看日誌
docker-compose logs -f backend
```

### 本地開發

```bash
# 後端
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## API 文件

啟動後訪問 `http://localhost:8000/docs` 查看 Swagger UI。

### API 模組

| 模組 | 路徑 | 說明 |
|------|------|------|
| 認證 | `/api/auth/*` | 註冊、登入、使用者資訊 |
| 股票 | `/api/stocks/*` | 股票搜尋、K線、籌碼、盤前 |
| 分析 | `/api/analysis/*` | 技術分析、籌碼分析、情緒分析、產業鏈 |
| 決策 | `/api/decision/*` | 多因子評分、雷達圖、決策樹訊號 |
| 持倉 | `/api/holdings/*` | 持倉管理、診斷 |
| 管理 | `/api/admin/*` | 股票同步、歷史數據初始化 |

## 專案結構

```
stock-analyzer/
├── backend/              # FastAPI 後端
│   ├── app/
│   │   ├── models/       # SQLAlchemy ORM (user, stock, daily_bar, holding, analysis, trade_log)
│   │   ├── schemas/      # Pydantic 驗證
│   │   ├── routers/      # API 路由 (auth, stocks, analysis, decision, holdings, admin)
│   │   ├── services/     # 業務邏輯 (technical, chip, sentiment, industry, scoring, pattern)
│   │   └── utils/        # 工具函式 (cache, security)
│   ├── worker/           # 獨立數據 Worker (twse, yahoo, crawler, sentiment, stock_list)
│   └── tests/
├── frontend/             # Next.js 16+ 前端
├── docker-compose.yml
└── plans/                # 架構規劃
```

## 開發階段

1. ✅ 後端基礎架構 (Models, Schemas, Routers, Auth)
2. ✅ 獨立數據 Worker 服務 (TWSE, Yahoo Finance, 新聞爬蟲, 情緒分析)
3. ✅ 股票數據 API 實作 (搜尋, K-line, 籌碼, 盤前)
4. ✅ 股票代碼管理 + 歷史數據批量初始化
5. ✅ 深度分析引擎 (技術分析, 籌碼分析, 產業鏈, LLM 情緒)
6. ✅ 決策工具模組 (多因子評分, 雷達圖, 決策樹訊號)
7. ✅ K線形態辨識引擎 (Marubozu, Hammer, Doji, Engulfing, Star, Island)
8. ✅ 前端 Next.js 專案初始化
9. ✅ 時間軸戰情室 UI (盤前/盤中/盤後)
10. ✅ 個股整合頁面 (/stock/[code])
11. ✅ 多週期 K 線圖 (日/週/月/分K + MA5/10/20/60/120)
12. ⏳ 系統整合測試

## 授權

Private
