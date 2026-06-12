"""
LLM 服務（Ollama）

- 新聞情緒評分（format=json 確保結構穩定）
- 個股 AI 綜合分析
- Redis 快取避免重複推論
- Ollama 不可用時回傳 None，由呼叫端 fallback 規則式分析
"""
import json
import logging
from typing import Optional

import httpx

from app.config import settings
from app.utils.cache import Cache

logger = logging.getLogger(__name__)


class LLMService:
    """Ollama LLM 推論服務"""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self.cache = Cache()

    async def _generate_json(self, prompt: str, timeout: float = 60.0) -> Optional[dict]:
        """呼叫 Ollama generate（format=json），失敗回傳 None"""
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                        # qwen3 系列關閉 thinking 模式以加快回應並確保 JSON 乾淨
                        "think": False,
                        "options": {"temperature": 0.2, "num_predict": 1024},
                    },
                )
                if res.status_code != 200:
                    logger.warning(f"Ollama 回應異常: {res.status_code}")
                    return None
                raw = res.json().get("response", "")
                return json.loads(raw)
        except (httpx.HTTPError, json.JSONDecodeError, Exception) as e:
            logger.warning(f"Ollama 推論失敗（將使用規則式 fallback）: {e}")
            return None

    async def is_available(self) -> bool:
        """檢查 Ollama 是否可用"""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def score_news_batch(self, stock_name: str, titles: list[str]) -> Optional[list[dict]]:
        """
        批次新聞情緒評分

        回傳與 titles 等長的列表：[{score: -1.0~1.0, summary: str}, ...]
        Ollama 不可用時回傳 None
        """
        if not titles:
            return []

        numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
        prompt = f"""你是台股新聞情緒分析師。針對「{stock_name}」的每則新聞標題，給出情緒分數與一句話摘要。

新聞標題：
{numbered}

評分規則：
- score：-1.0（極度利空）到 1.0（極度利多），0 為中性
- 只看對該股票股價的影響，不是新聞本身的好壞
- 與「{stock_name}」無關的新聞一律給 0
- summary：10 字內說明為何利多/利空/中性

回傳 JSON 格式（results 陣列長度必須等於 {len(titles)}）：
{{"results": [{{"score": 0.5, "summary": "營收創高利多"}}, ...]}}"""

        result = await self._generate_json(prompt, timeout=90.0)
        if not result or "results" not in result:
            return None

        items = result["results"]
        if not isinstance(items, list):
            return None

        # 正規化：確保等長、分數在範圍內
        normalized = []
        for i in range(len(titles)):
            item = items[i] if i < len(items) and isinstance(items[i], dict) else {}
            try:
                score = max(-1.0, min(1.0, float(item.get("score", 0))))
            except (TypeError, ValueError):
                score = 0.0
            normalized.append({
                "score": round(score, 2),
                "summary": str(item.get("summary", ""))[:50],
            })
        return normalized

    async def analyze_stock(self, context: dict) -> Optional[dict]:
        """
        個股 AI 綜合分析（決策中心用）

        context 應包含 stock_code/stock_name/total_score/各維度分數/技術指標/籌碼/新聞摘要
        回傳 {summary, bullish_points[], bearish_points[], risks[], suggestion, perspective}
        失敗回傳 None
        """
        cache_key = f"llm:analysis:{context.get('stock_code')}:{context.get('analyzed_date', '')}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        prompt = f"""你是專業台股分析師。根據以下量化數據，為投資人解讀「{context.get('stock_name', '')}（{context.get('stock_code')}）」的多因子評分。

## 評分數據
- 綜合評分：{context.get('total_score')}/100（技術 {context.get('technical_score')}、籌碼 {context.get('chip_score')}、基本 {context.get('fundamental_score')}、情緒 {context.get('sentiment_score')}）
- 權重：技術 30%、籌碼 20%、基本 15%、情緒 15%、K線形態 20%

## 技術面
{json.dumps(context.get('technical_detail', {}), ensure_ascii=False)}

## 籌碼面
{json.dumps(context.get('chip_detail', {}), ensure_ascii=False)}

## 近期 K 線形態
{json.dumps(context.get('patterns', []), ensure_ascii=False)}

## 近期新聞
{json.dumps(context.get('news', []), ensure_ascii=False)}

## 價位參考
現價 {context.get('current_price')}、支撐 {context.get('support')}、壓力 {context.get('resistance')}、ATR {context.get('atr_14')}

請以繁體中文回傳 JSON：
{{
  "summary": "80字內總結：為什麼是這個分數、現在處於什麼位置",
  "bullish_points": ["利多觀點1", "利多觀點2"],
  "bearish_points": ["利空觀點1", "利空觀點2"],
  "risks": ["需要注意的風險點1", "風險點2"],
  "suggestion": "50字內操作建議（含進出場思路）",
  "perspective": "本次分析主要從哪個角度切入（如：技術面波段、籌碼追蹤）"
}}"""

        result = await self._generate_json(prompt, timeout=120.0)
        if result and "summary" in result:
            await self.cache.set(cache_key, result, expire=3600)  # 快取 1 小時
            return result
        return None


# 全域實例
llm_service = LLMService()
