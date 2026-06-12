"""手動觸發全市場 K 線快照"""
import asyncio
import logging

logging.basicConfig(level=logging.INFO)

from worker.market_snapshot_worker import fetch_market_snapshot

result = asyncio.run(fetch_market_snapshot())
print("RESULT:", result)
