"""
獨立數據 Worker 服務入口
與 FastAPI 分離運行，避免事件循環排程抖動
"""
import asyncio
import logging
import signal
import sys

from app.config import settings
from app.database import init_db, close_db
from worker import scheduler

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# 優雅關閉旗標
_shutdown_event = asyncio.Event()


def signal_handler(signum, frame):
    """處理終止信號"""
    logger.info(f"收到信號 {signum}，準備關閉 Worker...")
    _shutdown_event.set()


async def start_worker():
    """啟動 Worker 服務"""
    logger.info("正在啟動 Data Ingestion Worker...")

    # 初始化資料庫
    await init_db()
    logger.info("資料庫連線建立")

    # 註冊排程任務
    scheduler.register_jobs()
    scheduler.start_scheduler()
    logger.info("排程任務已註冊")

    logger.info("Worker 服務運行中...")
    logger.info("按 Ctrl+C 停止")

    # 等待終止信號
    await _shutdown_event.wait()


async def stop_worker():
    """停止 Worker 服務"""
    logger.info("正在關閉 Worker...")

    # 停止排程器
    scheduler.stop_scheduler()
    logger.info("排程器已停止")

    # 關閉資料庫
    await close_db()
    logger.info("資料庫連線已關閉")


def main():
    """主程序入口"""
    # 註冊信號處理器
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # 運行異步主程序
    try:
        asyncio.run(start_worker())
    except KeyboardInterrupt:
        logger.info("收到中斷信號")
    finally:
        asyncio.run(stop_worker())


if __name__ == "__main__":
    main()
