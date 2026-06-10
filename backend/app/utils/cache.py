"""
Redis 快取工具
用於 TWSE 速率限制防護與 LLM 推論結果快取
"""
import json
import asyncio
from typing import Any, Optional
from redis.asyncio import Redis
from app.config import settings

# Redis 連線
_cache: Optional[Redis] = None


async def get_redis() -> Redis:
    """取得 Redis 連線 (單例)"""
    global _cache
    if _cache is None:
        _cache = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )
    return _cache


class Cache:
    """Redis 快取封裝"""
    
    def __init__(self):
        self._redis: Optional[Redis] = None
    
    async def _get_redis(self) -> Redis:
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis
    
    async def get(self, key: str) -> Optional[Any]:
        """取得快取"""
        try:
            redis = await self._get_redis()
            data = await redis.get(key)
            if data:
                return json.loads(data)
        except Exception:
            pass
        return None
    
    async def set(self, key: str, value: Any, expire: int = 300) -> bool:
        """設定快取 (預設 5 分鐘過期)"""
        try:
            redis = await self._get_redis()
            await redis.setex(key, expire, json.dumps(value, ensure_ascii=False, default=str))
            return True
        except Exception:
            return False
    
    async def delete(self, key: str) -> bool:
        """刪除快取"""
        try:
            redis = await self._get_redis()
            await redis.delete(key)
            return True
        except Exception:
            return False
    
    async def exists(self, key: str) -> bool:
        """檢查快取是否存在"""
        try:
            redis = await self._get_redis()
            return bool(await redis.exists(key))
        except Exception:
            return False
    
    async def set_rate_limit(self, key: str, expire: int = 60) -> bool:
        """
        速率限制: 設定一個 key，在 expire 秒內無法再次存取
        回傳 True 表示可以存取，False 表示被限制
        """
        try:
            redis = await self._get_redis()
            # 使用 SET NX 只在 key 不存在時設定
            result = await redis.set(key, "1", ex=expire, nx=True)
            return result is True
        except Exception:
            return True  # 錯誤時允許存取


# 全域快取實例
cache = Cache()
