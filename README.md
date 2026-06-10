# 股票分析系統

整合量化交易與系統化投資的股票分析平台。

## 技術架構

- **前端**: Next.js 14 + ECharts + Zustand
- **後端**: Python FastAPI (asyncpg)
- **資料庫**: PostgreSQL + TimescaleDB + Redis
- **AI**: Ollama (qwen/gemma)
- **部署**: Docker Compose

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

## 專案結構

```
stock-analyzer/
├── backend/              # FastAPI 後端
│   ├── app/
│   │   ├── models/       # SQLAlchemy ORM
│   │   ├── schemas/      # Pydantic 驗證
│   │   ├── routers/      # API 路由
│   │   ├── services/     # 業務邏輯
│   │   └── utils/        # 工具函式
│   ├── worker/           # 獨立數據 Worker
│   └── tests/
├── frontend/             # Next.js 前端
├── docker-compose.yml
└── plans/                # 架構規劃
```

## 開發階段

1. ✅ 基礎架構 (MVP) - 進行中
2. 獨立 Worker 服務
3. 數據整合與 API 完善
4. 分析引擎
5. AI 整合
6. 前端完善
7. 優化與部署

## 授權

Private
