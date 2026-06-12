"""
FastAPI 主入口
股票分析系統 API Server
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import init_db, close_db
from app.utils.ratelimit import limiter
from app.routers import auth, holdings, stocks, analysis, decision, admin, websocket, watchlist, paper_trades
# 確保新模型被 ORM metadata 掃描到（create_all 建表）
import app.models.watchlist  # noqa: F401
import app.models.score_history  # noqa: F401
import app.models.paper_trade  # noqa: F401

# 結構化日誌設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
access_logger = logging.getLogger("api.access")

# Sentry 錯誤追蹤（設定 SENTRY_DSN 才啟用）
if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=0.1,
            environment=settings.ENV,
        )
        logging.getLogger(__name__).info("Sentry 錯誤追蹤已啟用")
    except ImportError:
        logging.getLogger(__name__).warning("SENTRY_DSN 已設定但未安裝 sentry-sdk，跳過")

# 需要初始化的核心股票（熱門 + 指數成分）
CORE_STOCKS = [
    "2330", "2317", "2454", "2412", "2882", "2881",
    "3008", "2308", "1301", "2886", "2303", "2002",
    "2891", "2892", "5880", "2884", "2885", "2886",
    "2357", "4938", "2395", "3711", "2379", "3045",
    "0050", "0056",
]

# MA240 需要 240 個交易日 ≈ 1 年，抓 3 年資料保有充足歷史
HISTORY_DAYS = 1095  # 3 年


async def _auto_init_data():
    """
    首次啟動時自動初始化：同步股票列表 + 抓取核心股票歷史數據
    僅在資料庫完全空白時執行，避免每次重啟都重跑
    """
    import logging
    logger = logging.getLogger("auto_init")

    try:
        from app.database import async_session_factory
        from app.models.stock import Stock
        from app.models.daily_bar import DailyBar
        from sqlalchemy import select, func

        async with async_session_factory() as session:
            stock_count = (await session.execute(
                select(func.count()).select_from(Stock)
            )).scalar() or 0
            bar_count = (await session.execute(
                select(func.count()).select_from(DailyBar)
            )).scalar() or 0

        if stock_count > 0 and bar_count > 100:
            logger.info(f"[AutoInit] 已有 {stock_count} 支股票、{bar_count} 筆K線，跳過初始化")
            return

        logger.info("[AutoInit] 資料庫為空，開始自動初始化...")

        # Step 1: 同步股票列表
        logger.info("[AutoInit] Step 1/2 — 同步股票列表...")
        try:
            from worker.stock_list_worker import sync_stock_list
            result = await sync_stock_list("all")
            logger.info(f"[AutoInit] 股票列表同步完成: {result}")
        except Exception as e:
            logger.warning(f"[AutoInit] 股票列表同步失敗（可能網路問題），插入核心股票: {e}")
            # fallback: 手動插入核心股票
            await _insert_core_stocks_fallback()

        # Step 2: 抓取核心股票歷史 K 線（背景，不阻塞 API）
        logger.info(f"[AutoInit] Step 2/2 — 抓取 {len(CORE_STOCKS)} 支核心股票 {HISTORY_DAYS} 天歷史數據...")
        asyncio.create_task(_fetch_core_history())

    except Exception as e:
        import logging
        logging.getLogger("auto_init").error(f"[AutoInit] 初始化失敗: {e}")


async def _insert_core_stocks_fallback():
    """網路失敗時，至少把核心股票名稱寫入 DB"""
    CORE_NAMES = {
        "2330": "台積電", "2317": "鴻海", "2454": "聯發科",
        "2412": "中華電", "2882": "國泰金", "2881": "富邦金",
        "3008": "大立光", "2308": "台達電", "1301": "台塑",
        "2886": "兆豐金", "2303": "聯電", "2002": "中鋼",
        "2891": "中信金", "2892": "第一金", "5880": "合庫金",
        "2884": "玉山金", "2885": "元大金", "2357": "華碩",
        "4938": "和碩", "2395": "研華", "3711": "日月光投控",
        "2379": "瑞昱", "3045": "台灣大", "0050": "元大台灣50",
        "0056": "元大高股息",
    }
    from app.database import async_session_factory
    from app.models.stock import Stock
    from sqlalchemy import select

    async with async_session_factory() as session:
        for code, name in CORE_NAMES.items():
            existing = (await session.execute(
                select(Stock).where(Stock.code == code)
            )).scalar_one_or_none()
            if not existing:
                session.add(Stock(code=code, name=name, market="twse", stock_type="stock"))
        await session.commit()


async def _fetch_core_history():
    """背景任務：抓取核心股票歷史數據，每支間隔 1 秒避免 rate limit"""
    import logging
    logger = logging.getLogger("auto_init")

    from worker.yahoo_worker import yahoo_worker

    success, failed = 0, 0
    for code in CORE_STOCKS:
        try:
            symbol = f"{code}.TW" if not code.startswith("^") else code
            klines = await yahoo_worker.fetch_historical_kline(symbol, HISTORY_DAYS)
            if klines:
                saved = await yahoo_worker.save_kline_data(code, klines)
                logger.info(f"[AutoInit] {code}: 儲存 {saved} 筆 K 線")
                success += 1
            else:
                logger.warning(f"[AutoInit] {code}: 無數據")
                failed += 1
            await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"[AutoInit] {code} 失敗: {e}")
            failed += 1
            await asyncio.sleep(2.0)

    logger.info(f"[AutoInit] 歷史數據初始化完成：成功 {success} 支，失敗 {failed} 支")


async def _prewarm_sinopac():
    """背景建立永豐金 Shioaji 長連線，不阻塞 API 啟動
    登入 + 合約下載完成後，所有 kline 請求都走 Sinopac
    """
    import sys
    try:
        if not (settings.SINOPAC_API_KEY and settings.SINOPAC_SECRET_KEY):
            print("[Sinopac] 未設定 API Key，跳過預熱（yfinance）", flush=True)
            return

        await asyncio.sleep(2)  # 等 DB 完全就緒
        print("[Sinopac] 正在建立永豐金 Shioaji 長連線...", flush=True)

        from worker.sinopac_worker import connect_sinopac
        ok = await connect_sinopac(settings.SINOPAC_API_KEY, settings.SINOPAC_SECRET_KEY)

        if ok:
            print("[Sinopac] 長連線完成，台股日K線直接使用永豐金 API", flush=True)
        else:
            print("[Sinopac] 連線失敗，fallback 到 yfinance", flush=True)
    except Exception as e:
        print(f"[Sinopac] 預熱失敗（fallback yfinance）: {e}", flush=True)
        sys.stdout.flush()


async def _auto_backfill_margin():
    """
    啟動時自動偵測並補回近 30 天融資餘額缺口。
    只處理 margin_balance 為 NULL 但 chip_data 已存在的日期，不重複抓取。
    """
    import logging
    logger = logging.getLogger("auto_backfill_margin")
    try:
        from app.database import async_session_factory
        from app.models.daily_bar import ChipData
        from sqlalchemy import select, func
        from datetime import date, timedelta

        # 檢查近 30 天有幾筆 chip_data 缺 margin_balance
        cutoff = date.today() - timedelta(days=30)
        async with async_session_factory() as session:
            missing_count = (await session.execute(
                select(func.count()).select_from(ChipData).where(
                    ChipData.trade_date >= cutoff,
                    ChipData.margin_balance.is_(None),
                )
            )).scalar() or 0

        if missing_count == 0:
            logger.info("融資餘額已完整，跳過回補")
            return

        logger.info(f"偵測到 {missing_count} 筆 chip_data 缺融資資料，開始背景補回（近 30 天）...")
        from worker.chip_worker import chip_worker
        from datetime import date, timedelta

        today = date.today()
        for i in range(30):
            d = today - timedelta(days=i)
            if d.weekday() >= 5:
                continue
            import asyncio
            try:
                # 上市融資
                margin_rows = await chip_worker.fetch_mi_margn(d, market="twse")
                if margin_rows:
                    updated = await chip_worker.update_margin_data(d, margin_rows)
                    if updated:
                        logger.info(f"融資補回 {d}[上市]: {updated} 筆")
                await asyncio.sleep(3)

                # 上櫃融資
                margin_rows = await chip_worker.fetch_mi_margn(d, market="tpex")
                if margin_rows:
                    updated = await chip_worker.update_margin_data(d, margin_rows)
                    if updated:
                        logger.info(f"融資補回 {d}[上櫃]: {updated} 筆")
                await asyncio.sleep(3)
            except Exception as e:
                logger.warning(f"融資補回 {d} 失敗: {e}")

        logger.info("融資餘額自動補回完成（上市+上櫃）")
    except Exception as e:
        logger.warning(f"融資餘額自動補回失敗（不影響啟動）: {e}")


async def _seed_dev_user():
    """開發環境自動建立測試帳號 dev / dev12345（生產環境不執行）"""
    if settings.ENV != "development":
        return
    try:
        from app.database import async_session_factory
        from app.models.user import User
        from app.utils.security import get_password_hash
        from sqlalchemy import select

        async with async_session_factory() as session:
            existing = (await session.execute(
                select(User).where(User.username == "dev")
            )).scalar_one_or_none()
            if not existing:
                session.add(User(
                    username="dev",
                    email="dev@localhost.dev",
                    password_hash=get_password_hash("dev12345"),
                    display_name="開發測試帳號",
                ))
                await session.commit()
                print("✅ 已建立開發測試帳號: dev / dev12345")
    except Exception as e:
        print(f"⚠️  建立開發測試帳號失敗: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 啟動時
    print("🚀 正在初始化資料庫...")
    await init_db()
    print("✅ 資料庫初始化完成")

    # 開發環境建立測試帳號
    await _seed_dev_user()

    # 自動初始化股票數據（首次啟動時）
    asyncio.create_task(_auto_init_data())

    # 自動補融資餘額缺口（背景，不阻塞啟動）
    asyncio.create_task(_auto_backfill_margin())

    # 背景預熱 Sinopac（不阻塞 API）
    asyncio.create_task(_prewarm_sinopac())

    # 啟動 APScheduler 排程（定時抓取日數據）
    try:
        from worker.scheduler import scheduler, register_jobs, start_scheduler
        register_jobs()
        start_scheduler()
        print("✅ APScheduler 排程已啟動")
    except Exception as e:
        print(f"⚠️  APScheduler 啟動失敗（可跳過）: {e}")

    yield

    # 關閉時
    print("🔌 正在關閉資料庫連線...")
    await close_db()
    print("✅ 資料庫連線已關閉")

    # 停止 APScheduler
    try:
        from worker.scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass

    # 停止訂閱管理服務
    try:
        from app.services.subscription import subscription_manager
        await subscription_manager.stop()
    except Exception:
        pass

    # 安全關閉 Sinopac 長連線
    try:
        from worker.sinopac_worker import sinopac_service
        sinopac_service.logout()
    except Exception:
        pass


# 建立 FastAPI 應用程式
app = FastAPI(
    title="股票分析系統 API",
    description="整合量化交易與系統化投資的股票分析平台",
    version="1.0.0",
    lifespan=lifespan
)

# 速率限制（/login, /register 等端點使用 @limiter.limit 裝飾器）
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 請求存取日誌 middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 1)
    # 健康檢查不記錄，避免噪音
    if request.url.path != "/health":
        access_logger.info(
            "%s %s status=%s duration=%sms ip=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request.client.host if request.client else "-",
        )
    return response

# 註冊路由
app.include_router(auth.router)
app.include_router(holdings.router)
app.include_router(stocks.router)
app.include_router(analysis.router)
app.include_router(decision.router)
app.include_router(admin.router)
app.include_router(websocket.router)
app.include_router(watchlist.router)
app.include_router(paper_trades.router)


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
