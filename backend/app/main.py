"""
FastAPI 主入口
股票分析系統 API Server
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, close_db
from app.routers import auth, holdings, stocks, analysis, decision, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 啟動時
    print("🚀 正在初始化資料庫...")
    await init_db()
    print("✅ 資料庫初始化完成")
    
    yield
    
    # 關閉時
    print("🔌 正在關閉資料庫連線...")
    await close_db()
    print("✅ 資料庫連線已關閉")


# 建立 FastAPI 應用程式
app = FastAPI(
    title="股票分析系統 API",
    description="整合量化交易與系統化投資的股票分析平台",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊路由
app.include_router(auth.router)
app.include_router(holdings.router)
app.include_router(stocks.router)
app.include_router(analysis.router)
app.include_router(decision.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    """API 根端點"""
    return {
        "name": "股票分析系統 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {
        "status": "ok",
        "env": settings.ENV
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
