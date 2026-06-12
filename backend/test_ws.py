"""測試 WebSocket 連線"""
import asyncio
import websockets

async def test():
    try:
        async with websockets.connect("ws://localhost:8000/ws/stock/2330?interval=daily") as ws:
            msg = await ws.recv()
            print("Connected:", msg)
    except Exception as e:
        print("Error:", type(e).__name__, e)

asyncio.run(test())
