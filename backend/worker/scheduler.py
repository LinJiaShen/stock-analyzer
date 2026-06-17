"""
APScheduler 排程器設定
管理所有定時任務的註冊與執行
"""
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# 全域排程器實例
scheduler = AsyncIOScheduler()


def register_jobs():
    """
    註冊所有定時任務
    
    排程時間說明:
    - TWSE 日數據: 每個交易日 18:00 (盤後)
    - Yahoo ADR: 每個工作日 17:30 (美股收盤後)
    - 新聞爬蟲: 每 1 小時
    - 籌碼數據: 每個交易日 18:30
    - 情緒分析: 每 2 小時
    """
    from worker.twse_worker import fetch_all_stocks_daily
    from worker.yahoo_worker import fetch_adr_data, fetch_index_data
    from worker.crawler_worker import fetch_news
    from worker.sentiment_worker import analyze_all_holdings
    from worker.chip_worker import fetch_daily_chip
    from worker.market_snapshot_worker import fetch_market_snapshot
    from worker.paper_trade_worker import intraday_trigger_job, daily_auto_pick_job, daily_equity_snapshot_job
    from worker.tdcc_worker import fetch_weekly_tdcc
    from worker.monthly_revenue_worker import fetch_monthly_revenue
    from worker.alert_worker import alert_scan_job

    # TWSE 日數據抓取 - 週一至週五 18:00
    scheduler.add_job(
        fetch_all_stocks_daily,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=0),
        id="twse_daily",
        name="TWSE 日數據抓取",
        replace_existing=True
    )
    logger.info("✅ 已註冊: TWSE 日數據抓取 (週一至週五 18:00)")

    # Yahoo ADR 數據 - 盤前 08:00（抓美股昨晚收盤）+ 盤後 17:30（確認最終值）
    scheduler.add_job(
        fetch_adr_data,
        CronTrigger(day_of_week="mon-fri", hour=8, minute=0),
        id="yahoo_adr_premarket",
        name="Yahoo ADR 數據（盤前）",
        replace_existing=True
    )
    scheduler.add_job(
        fetch_adr_data,
        CronTrigger(day_of_week="mon-fri", hour=17, minute=30),
        id="yahoo_adr",
        name="Yahoo ADR 數據（盤後）",
        replace_existing=True
    )
    logger.info("✅ 已註冊: Yahoo ADR 數據 (週一至週五 08:00 + 17:30)")

    # Yahoo 大盤指數 - 盤前 08:00（抓美股昨晚收盤）+ 盤後 18:00
    scheduler.add_job(
        fetch_index_data,
        CronTrigger(day_of_week="mon-fri", hour=8, minute=0),
        id="yahoo_index_premarket",
        name="Yahoo 大盤指數（盤前）",
        replace_existing=True
    )
    scheduler.add_job(
        fetch_index_data,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=0),
        id="yahoo_index",
        name="Yahoo 大盤指數（盤後）",
        replace_existing=True
    )
    logger.info("✅ 已註冊: Yahoo 大盤指數 (週一至週五 08:00 + 18:00)")

    # AI 模擬交易：自動選股開倉 - 週一至週五 09:15
    scheduler.add_job(
        daily_auto_pick_job,
        CronTrigger(day_of_week="mon-fri", hour=9, minute=15),
        id="paper_auto_pick",
        name="AI模擬交易自動選股",
        replace_existing=True
    )
    logger.info("✅ 已註冊: AI模擬交易自動選股 (週一至週五 09:15)")

    # AI 模擬交易：盤中 TP/SL 觸發檢查 - 盤中每 5 分鐘
    scheduler.add_job(
        intraday_trigger_job,
        IntervalTrigger(minutes=5),
        id="paper_triggers",
        name="模擬單TP/SL觸發檢查",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 模擬單TP/SL觸發檢查 (盤中每 5 分鐘)")

    # AI 模擬交易：每日權益快照 - 週一至週五 18:10（市場快照 18:05 後）
    scheduler.add_job(
        daily_equity_snapshot_job,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=10),
        id="paper_equity_snapshot",
        name="模擬帳戶權益快照",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 模擬帳戶權益快照 (週一至週五 18:10)")

    # 全市場每日 K 線快照 - 週一至週五 18:05（2 個 OpenAPI 請求覆蓋上市+上櫃）
    scheduler.add_job(
        fetch_market_snapshot,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=5),
        id="market_snapshot",
        name="全市場K線快照",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 全市場K線快照 (週一至週五 18:05)")

    # 三大法人籌碼 (T86) - 週一至週五 18:30 (TWSE 約 17:00 後公布)
    scheduler.add_job(
        fetch_daily_chip,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=30),
        id="chip_daily",
        name="三大法人籌碼",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 三大法人籌碼 (週一至週五 18:30)")

    # 自訂預警掃描 - 週一至週五 18:40（行情+籌碼到齊後）
    scheduler.add_job(
        alert_scan_job,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=40),
        id="alert_scan",
        name="自訂預警掃描",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 自訂預警掃描 (週一至週五 18:40)")

    # TDCC 集保大戶持股 - 每週六 08:00（TDCC 通常週末更新上週資料）
    scheduler.add_job(
        fetch_weekly_tdcc,
        CronTrigger(day_of_week="sat", hour=8, minute=0),
        id="tdcc_weekly",
        name="TDCC 集保大戶持股",
        replace_existing=True
    )
    logger.info("✅ 已註冊: TDCC 集保大戶持股 (每週六 08:00)")

    # 月營收 - 每月 11 號 08:00（月營收於每月 10 號前公布）
    scheduler.add_job(
        fetch_monthly_revenue,
        CronTrigger(day=11, hour=8, minute=0),
        id="monthly_revenue",
        name="月營收",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 月營收 (每月 11 號 08:00)")

    # 新聞爬蟲 - 每 1 小時
    scheduler.add_job(
        fetch_news,
        IntervalTrigger(hours=1),
        id="news_crawler",
        name="新聞爬蟲",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 新聞爬蟲 (每 1 小時)")

    # 情緒分析 - 每 2 小時
    scheduler.add_job(
        analyze_all_holdings,
        IntervalTrigger(hours=2),
        id="sentiment_analysis",
        name="情緒分析",
        replace_existing=True
    )
    logger.info("✅ 已註冊: 情緒分析 (每 2 小時)")


def start_scheduler():
    """啟動排程器"""
    if not scheduler.running:
        scheduler.start()
        logger.info("🕐 APScheduler 已啟動")


def stop_scheduler():
    """停止排程器"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("🕐 APScheduler 已停止")
