"""
全市場歷史 K 線回補（可中斷續跑）

- 跳過已有足夠資料的股票（>= MIN_BARS 根）
- 上市用 {code}.TW、上櫃用 {code}.TWO（yfinance 後綴不同）
- 使用 yfinance（避免消耗永豐 API 流量配額）
- 每 25 檔輸出進度

執行（容器內背景）:
    docker exec -d stack-backend-1 sh -c "python backfill_all_kline.py > /tmp/backfill.log 2>&1"
查進度:
    docker exec stack-backend-1 tail -5 /tmp/backfill.log
"""
import asyncio
import logging

logging.basicConfig(level=logging.WARNING)  # 安靜模式，只看進度行
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)  # 壓掉 echo 噪音
logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)
logger = logging.getLogger("backfill")
logger.setLevel(logging.INFO)

MIN_BARS = 100   # 已有 100 根以上視為已回補
DAYS = 730       # 回補 2 年
SLEEP = 0.6      # 每檔間隔（yfinance 速率保護）


async def main():
    from sqlalchemy import select, func, text
    from app.database import async_session_factory
    from app.models.stock import Stock
    from app.models.daily_bar import DailyBar
    from worker.yahoo_worker import yahoo_worker, _yf_download_sync

    async with async_session_factory() as session:
        # 各股現有 bar 數
        res = await session.execute(
            select(DailyBar.stock_code, func.count())
            .group_by(DailyBar.stock_code)
        )
        bar_counts = dict(res.all())

        res = await session.execute(select(Stock.code, Stock.market))
        stocks = res.all()

    todo = [(c, m) for c, m in stocks if bar_counts.get(c, 0) < MIN_BARS]
    print(f"全市場 {len(stocks)} 檔，需回補 {len(todo)} 檔（已完成 {len(stocks) - len(todo)}）", flush=True)

    ok, fail = 0, 0
    for i, (code, market) in enumerate(todo, 1):
        suffix = ".TWO" if market == "tpex" else ".TW"
        try:
            klines = await yahoo_worker._run_sync(_yf_download_sync, f"{code}{suffix}", "2y", "1d")
            if klines:
                saved = await yahoo_worker.save_kline_data(code, klines)
                ok += 1
            else:
                fail += 1
        except Exception as e:
            fail += 1

        if i % 25 == 0:
            print(f"進度 {i}/{len(todo)}（成功 {ok}、無資料/失敗 {fail}）", flush=True)
        await asyncio.sleep(SLEEP)

    print(f"DONE: 成功 {ok}、失敗 {fail}", flush=True)


asyncio.run(main())
