"""
產業鏈分析服務
- 同業表現比較
- 產業鏈上下游關係
- 產業輪動分析
"""

from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
import numpy as np

from app.models.stock import Stock, IndustryChain
from app.models.daily_bar import DailyBar


class IndustryService:
    """產業鏈分析服務"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_stock_industry(self, stock_code: str) -> Optional[str]:
        """取得股票所屬產業"""
        stmt = select(Stock.industry).where(Stock.code == stock_code)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_peers(self, industry: str, exclude_code: str, limit: int = 10) -> list[dict]:
        """取得同業股票"""
        stmt = (
            select(Stock.code, Stock.name, Stock.industry)
            .where(
                Stock.industry == industry,
                Stock.code != exclude_code,
            )
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = result.all()
        return [{"code": r.code, "name": r.name} for r in rows]

    async def _get_stock_return(self, stock_code: str, days: int = 30) -> Optional[float]:
        """取得股票區間報酬率"""
        cutoff_date = datetime.now() - timedelta(days=days)
        stmt = (
            select(DailyBar)
            .where(
                DailyBar.stock_code == stock_code,
                DailyBar.trade_date >= cutoff_date,
            )
            .order_by(DailyBar.trade_date)
        )
        result = await self.db.execute(stmt)
        bars = result.scalars().all()

        if len(bars) < 2:
            return None

        first_close = bars[0].close
        last_close = bars[-1].close

        if first_close and last_close and first_close > 0:
            return (last_close - first_close) / first_close * 100
        return None

    async def analyze_peers(self, stock_code: str, days: int = 30) -> dict:
        """
        同業表現分析
        - 個股 vs 同業平均報酬
        - 同業強弱排名
        - 相對強弱指標 RSI
        """
        industry = await self._get_stock_industry(stock_code)
        if not industry:
            return {
                "industry": "unknown",
                "peers": [],
                "peer_avg_return": 0,
                "stock_return": 0,
                "relative_strength": 0,
                "rank": 0,
                "total_peers": 0,
                "signal": "neutral",
            }

        peers = await self._get_peers(industry, stock_code)
        stock_return = await self._get_stock_return(stock_code, days) or 0

        # 計算同業報酬
        peer_returns = []
        for peer in peers:
            ret = await self._get_stock_return(peer["code"], days)
            if ret is not None:
                peer_returns.append({"code": peer["code"], "name": peer["name"], "return": ret})

        peer_avg_return = 0
        if peer_returns:
            peer_avg_return = float(np.mean([p["return"] for p in peer_returns]))

        # 排名
        all_returns = [{"code": stock_code, "return": stock_return}] + peer_returns
        all_returns.sort(key=lambda x: x["return"], reverse=True)

        rank = 1
        for i, r in enumerate(all_returns):
            if r["code"] == stock_code:
                rank = i + 1
                break

        total_peers = len(all_returns)

        # 相對強弱
        if peer_avg_return != 0:
            relative_strength = stock_return / peer_avg_return
        else:
            relative_strength = 1.0 if stock_return > 0 else 0.0

        # 訊號
        if rank <= total_peers * 0.3 and relative_strength > 1.2:
            signal = "strong_outperform"
        elif rank <= total_peers * 0.5 and relative_strength > 1.0:
            signal = "outperform"
        elif rank >= total_peers * 0.7 and relative_strength < 0.8:
            signal = "underperform"
        else:
            signal = "neutral"

        return {
            "industry": industry,
            "peers": peer_returns[:10],
            "peer_avg_return": round(peer_avg_return, 2),
            "stock_return": round(stock_return, 2),
            "relative_strength": round(relative_strength, 3),
            "rank": rank,
            "total_peers": total_peers,
            "signal": signal,
        }

    async def analyze_upstream_downstream(self, stock_code: str) -> dict:
        """
        上下游產業鏈分析
        - 上游供應商
        - 下游客戶
        - 產業鏈傳導效應
        """
        stmt = select(IndustryChain).where(IndustryChain.stock_code == stock_code)
        result = await self.db.execute(stmt)
        chain = result.scalar_one_or_none()

        if not chain:
            return {
                "upstream_industries": [],
                "downstream_industries": [],
                "chain_position": "unknown",
                "transmission_effect": "neutral",
            }

        return {
            "upstream_industries": chain.upstream_industries or [],
            "downstream_industries": chain.downstream_industries or [],
            "chain_position": chain.chain_position or "unknown",
            "transmission_effect": "neutral",
        }

    async def analyze_rotation(self, stock_code: str, days: int = 30) -> dict:
        """
        產業輪動分析
        - 當前熱門產業
        - 資金流向
        - 輪動階段判斷
        """
        industry = await self._get_stock_industry(stock_code)

        # 取得所有產業的平均報酬
        stmt = select(Stock.industry, func.avg(DailyBar.close)).where(
            DailyBar.trade_date >= datetime.now() - timedelta(days=days)
        ).group_by(Stock.industry)

        # 簡化版本：回傳基本輪動資訊
        return {
            "current_industry": industry,
            "rotation_phase": "mid_cycle",
            "hot_industries": [],
            "cold_industries": [],
            "capital_flow": "neutral",
            "signal": "neutral",
        }

    async def analyze(self, stock_code: str, days: int = 30) -> dict:
        """
        完整產業鏈分析
        """
        peers = await self.analyze_peers(stock_code, days)
        chain = await self.analyze_upstream_downstream(stock_code)
        rotation = await self.analyze_rotation(stock_code, days)

        # 綜合評分
        score = 50  # 基準分

        # 同業表現加減分
        if peers["signal"] == "strong_outperform":
            score += 20
        elif peers["signal"] == "outperform":
            score += 10
        elif peers["signal"] == "underperform":
            score -= 10

        # 相對強弱加減分
        rs = peers.get("relative_strength", 1.0)
        if rs > 1.3:
            score += 10
        elif rs > 1.1:
            score += 5
        elif rs < 0.7:
            score -= 10
        elif rs < 0.9:
            score -= 5

        # 限制範圍 0-100
        score = max(0, min(100, score))

        # 綜合訊號
        if score >= 70:
            overall_signal = "strong_buy"
        elif score >= 60:
            overall_signal = "buy"
        elif score >= 40:
            overall_signal = "neutral"
        elif score >= 30:
            overall_signal = "sell"
        else:
            overall_signal = "strong_sell"

        return {
            "stock_code": stock_code,
            "score": score,
            "signal": overall_signal,
            "peers": peers,
            "chain": chain,
            "rotation": rotation,
            "analyzed_at": datetime.now().isoformat(),
        }
