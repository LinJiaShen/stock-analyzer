"""同步股票列表"""
import asyncio
import httpx

async def sync():
    async with httpx.AsyncClient() as client:
        resp = await client.post("http://localhost:8000/api/admin/sync-stocks")
        print(resp.status_code)
        print(resp.text)

asyncio.run(sync())
