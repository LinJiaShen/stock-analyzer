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
    from backend.worker.twse_worker import fetch_all_stocks_daily
    from backend.worker.yahoo_worker import fetch_adr_data, fetch_index_data
    from backend.worker.crawler_worker import fetch_news
    from backend.worker.sentiment_worker import analyze_all_holdings

    # TWSE 日數據抓取 - 週一至週五 18:00
    scheduler.add_job(
        fetch_all_stocks_daily,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=0),
        id="twse_daily",
        name="TWSE 日數據抓取",
        replace_existing=True
    )
    logger.info("✅ 已註冊: TWSE 日數據抓取 (週一至週五 18:00)")

    # Yahoo ADR 數據 - 週一至週五 17:30
    scheduler.add_job(
        fetch_adr_data,
        CronTrigger(day_of_week="mon-fri", hour=17, minute=30),
        id="yahoo_adr",
        name="Yahoo ADR 數據",
        replace_existing=True
    )
    logger.info("✅ 已註冊: Yahoo ADR 數據 (週一至週五 17:30)")

    # Yahoo 大盤指數 - 週一至週五 18:00
    scheduler.add_job(
        fetch_index_data,
        CronTrigger(day_of_week="mon-fri", hour=18, minute=0),
        id="yahoo_index",
        name="Yahoo 大盤指數",
        replace_existing=True
    )
    logger.info("✅ 已註冊: Yahoo 大盤指數 (週一至週五 18:00)")

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
