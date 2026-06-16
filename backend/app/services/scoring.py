"""
決策評分服務
- 多因子綜合評分
- 雷達圖數據計算
- 決策樹訊號產生
- K 線形態因子整合
"""

from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import numpy as np

from app.models.stock import Stock
from app.models.daily_bar import DailyBar
from app.services.technical import TechnicalService
from app.services.chip import ChipService
from app.services.sentiment import SentimentService
from app.services.industry import IndustryService
from app.services.pattern import PatternService


class ScoringService:
    """決策評分服務"""

    # 各維度權重（總和 = 1.0）
    WEIGHTS = {
        "technical": 0.30,
        "chip": 0.20,
        "fundamental": 0.15,
        "sentiment": 0.15,
        "pattern": 0.20,
    }

    def __init__(self, db: AsyncSession):
        self.db = db
        self.tech_service = TechnicalService(db)
        self.chip_service = ChipService(db)
        self.sentiment_service = SentimentService(db)
        self.industry_service = IndustryService(db)
        self.pattern_service = PatternService()

    async def _ensure_kline_data(self, stock_code: str) -> None:
        """確保有 K 線數據；若 DB 無資料則同步抓取（阻塞直到完成）"""
        bars = await self.tech_service._fetch_bars(stock_code, days=30)
        if len(bars) < 20:
            try:
                from worker.yahoo_worker import yahoo_worker
                symbol = f"{stock_code}.TW"
                klines = await yahoo_worker.fetch_historical_kline(symbol, 1095)
                if klines:
                    await yahoo_worker.save_kline_data(stock_code, klines)
            except Exception:
                pass

    async def calculate_composite_score(self, stock_code: str) -> dict:
        """
        多因子綜合評分
        回傳 0-100 的綜合戰鬥力分數
        包含: 技術面、籌碼面、基本面、情緒面、K線形態
        """
        # 確保有足夠的 K 線數據（首次查詢會自動抓取，約 5-10 秒）
        await self._ensure_kline_data(stock_code)

        # 並行取得各維度分析
        technical = await self.tech_service.analyze(stock_code, "medium")
        chip = await self.chip_service.analyze(stock_code, 90)
        sentiment = await self.sentiment_service.analyze(stock_code, 7)
        industry = await self.industry_service.analyze(stock_code, 30)

        # K 線形態分析
        bars = await self.tech_service._fetch_bars(stock_code, days=120)
        patterns = self.pattern_service.detect_all(bars)
        pattern_score = self.pattern_service.get_pattern_score(patterns)

        # ATR 與進出場參考價位（bars 為 dict：open/high/low/close/volume）
        current_price = None
        atr_14 = None
        resistance = None
        support = None
        if len(bars) >= 15:
            current_price = float(bars[-1]["close"]) or None
            atr_14 = self._calculate_atr(bars, 14)
            # 以近 20 根 K 線的最高/最低作為壓力/支撐代理
            recent = bars[-20:]
            resistance = round(max(b["high"] or 0 for b in recent), 1)
            support_vals = [b["low"] or b["close"] for b in recent if b["low"] or b["close"]]
            support = round(min(support_vals), 1) if support_vals else None
        # 將 -100~100 轉換為 0~100
        pattern_norm = (pattern_score + 100) / 2

        # 只保留最近 10 根 K 線內的形態（用於前端顯示）
        max_idx = len(bars) - 1 if bars else 0
        recent_patterns = self.pattern_service.get_recent_patterns(
            patterns, max_idx, lookback=10
        )

        tech_score = technical.get("score", 50)
        chip_score = chip.get("score", 50)
        sentiment_score = sentiment.get("score", 50)
        fundamental_score = industry.get("score", 50)

        # 加權計算（包含 K 線形態）
        total_score = (
            tech_score * self.WEIGHTS["technical"]
            + chip_score * self.WEIGHTS["chip"]
            + fundamental_score * self.WEIGHTS["fundamental"]
            + sentiment_score * self.WEIGHTS["sentiment"]
            + pattern_norm * self.WEIGHTS["pattern"]
        )
        total_score = round(total_score, 1)

        # 健康等級
        if total_score >= 80:
            health_level = "excellent"
        elif total_score >= 65:
            health_level = "good"
        elif total_score >= 45:
            health_level = "fair"
        elif total_score >= 30:
            health_level = "poor"
        else:
            health_level = "critical"

        # 訊號置信度：多維度是否一致（一致 = 高信度，分歧 = 低信度）
        confidence = self._build_confidence(
            total_score,
            [tech_score, chip_score, fundamental_score, sentiment_score, pattern_norm],
        )

        # 操作建議（ATR 停損 / 壓力位目標 / 風報比）— 不依賴訊號，有價格資料就提供
        operation = None
        if current_price and atr_14:
            stop_loss = round(current_price - 1.5 * atr_14, 1)
            target = round(resistance, 1) if resistance and resistance > current_price else round(current_price * 1.05, 1)
            risk = current_price - stop_loss
            reward = target - current_price
            rr = round(reward / risk, 1) if risk > 0 else 0

            # 極端情況警示：跌破停損後的延伸風險位
            if support and support < stop_loss:
                ext_price = round(support, 1)
                ext_note = "跌破停損後下一支撐，續弱可能延伸至此"
            else:
                ext_price = round(stop_loss - 1.5 * atr_14, 1)
                ext_note = "停損若失守，依 ATR 估算的延伸風險位"
            downside_extension = {
                "price": ext_price,
                "pct": round((ext_price - current_price) / current_price * 100, 1),
                "note": ext_note,
            }

            operation = {
                "entry_note": f"參考進場區間 {round(current_price * 0.99, 1)}–{round(current_price * 1.005, 1)}（現價 {round(current_price, 1)}，依 ATR 波動 {round(atr_14, 1)} 計算）",
                "stop_loss": stop_loss,
                "stop_loss_pct": round((stop_loss - current_price) / current_price * 100, 1),
                "target": target,
                "target_pct": round((target - current_price) / current_price * 100, 1),
                "rr_ratio": rr,
                "hold_period": "波段（2–4 週）",
                "downside_extension": downside_extension,
            }

        return {
            "stock_code": stock_code,
            "total_score": total_score,
            "technical_score": tech_score,
            "chip_score": chip_score,
            "fundamental_score": fundamental_score,
            "sentiment_score": sentiment_score,
            "pattern_score": round(pattern_score, 1),
            "pattern_norm": round(pattern_norm, 1),
            "recent_patterns": recent_patterns,
            "health_level": health_level,
            "weights": self.WEIGHTS,
            "analyzed_at": datetime.now().isoformat(),
            "current_price": current_price,
            "atr_14": round(atr_14, 2) if atr_14 else None,
            "resistance": resistance,
            "support": support,
            "operation": operation,
            "confidence": confidence,
        }

    def _build_confidence(self, total_score: float, dims: list[float]) -> dict:
        """
        訊號置信度：衡量各維度評分的「一致程度」。

        - 方向一致性：多數維度與總分同向（同站在 50 上方或下方）
        - 分歧度：維度分數的標準差越小越一致
        - 決斷力：總分離中性 50 越遠，訊號越明確

        三者加權成 0–100 的置信度，並轉成 high/medium/low 等級。
        高分歧（各維度互相矛盾）會壓低置信度，提醒新手此時不宜重押。
        """
        valid = [float(d) for d in dims if d is not None]
        if not valid:
            return {"level": "low", "score": 0, "reason": "資料不足，無法評估一致性"}

        above = sum(1 for d in valid if d >= 50)
        below = len(valid) - above
        agreement = max(above, below) / len(valid)            # 0.5–1.0
        agreement_norm = (agreement - 0.5) / 0.5               # 0–1
        spread = float(np.std(valid))                          # 0–~30
        spread_factor = max(0.0, 1 - spread / 30)              # 1=高度一致
        decisiveness = min(1.0, abs(total_score - 50) / 50)    # 0–1

        raw = 0.5 * agreement_norm + 0.3 * spread_factor + 0.2 * decisiveness
        score = round(raw * 100)

        if score >= 66:
            level = "high"
        elif score >= 40:
            level = "medium"
        else:
            level = "low"

        same_dir = max(above, below)
        reason = f"{same_dir}/{len(valid)} 維度同向、分歧度 {spread:.0f} 分"
        if level == "low":
            reason += "，各維度訊號矛盾，建議降低部位或觀望"
        return {"level": level, "score": score, "reason": reason}

    def _calculate_atr(self, bars: list[dict], period: int = 14) -> float:
        """計算平均真實波幅 (ATR)；bars 為 dict 格式"""
        trs = []
        for i in range(1, len(bars)):
            h = bars[i]["high"] or 0
            l = bars[i]["low"] or 0
            pc = bars[i - 1]["close"] or 0
            if h == 0 and l == 0:
                continue
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        if not trs:
            return 0.0
        return float(np.mean(trs[-period:]))

    async def calculate_radar_data(self, stock_code: str) -> dict:
        """
        雷達圖數據
        五角雷達圖: 價值、動能、籌碼、成長、抗跌
        """
        technical = await self.tech_service.analyze(stock_code, "medium")
        chip = await self.chip_service.analyze(stock_code, 90)

        # 取得 K 線數據計算額外指標
        cutoff_date = datetime.now() - timedelta(days=120)
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

        # 價值分數 (基於 PE/PB 相對位置，這裡用簡化版本)
        value_score = 50
        if bars:
            # 用價格相對位置作為價值代理
            closes = [float(b.close_price) for b in bars if b.close_price]
            if len(closes) >= 60:
                current_price = closes[-1]
                avg_price = np.mean(closes)
                if current_price < avg_price * 0.9:
                    value_score = 70  # 低於均價，相對便宜
                elif current_price > avg_price * 1.1:
                    value_score = 30  # 高於均價，相對貴
                else:
                    value_score = 50

        # 動能分數 (基於技術分析)
        momentum_score = technical.get("score", 50)

        # 籌碼分數
        chip_score = chip.get("score", 50)

        # 成長分數 (基於營收成長，這裡用成交量成長作為代理)
        growth_score = 50
        if len(bars) >= 60:
            recent_volume = np.mean([b.volume or 0 for b in bars[-20:]])
            old_volume = np.mean([b.volume or 0 for b in bars[-60:-40]])
            if old_volume > 0:
                volume_growth = recent_volume / old_volume
                if volume_growth > 1.5:
                    growth_score = 80
                elif volume_growth > 1.2:
                    growth_score = 65
                elif volume_growth < 0.5:
                    growth_score = 30
                elif volume_growth < 0.8:
                    growth_score = 40
                else:
                    growth_score = 50

        # 抗跌分數 (基於下跌時的跌幅控制)
        resistance_score = 50
        if len(bars) >= 60:
            # 計算最大回撤
            peak = max(closes)
            trough = min(closes)
            if peak > 0:
                max_drawdown = (peak - trough) / peak
                if max_drawdown < 0.1:
                    resistance_score = 90
                elif max_drawdown < 0.2:
                    resistance_score = 75
                elif max_drawdown < 0.3:
                    resistance_score = 55
                elif max_drawdown < 0.5:
                    resistance_score = 35
                else:
                    resistance_score = 20

        return {
            "stock_code": stock_code,
            "radar": {
                "value": value_score,
                "momentum": momentum_score,
                "chip": chip_score,
                "growth": growth_score,
                "resistance": resistance_score,
            },
            "analyzed_at": datetime.now().isoformat(),
        }

    async def generate_signals(self, stock_code: Optional[str] = None, level: str = "all") -> list[dict]:
        """
        決策樹觸發訊號
        基於多條件規則產生操作建議
        """
        signals = []

        # 如果指定股票，只分析該股票
        if stock_code:
            score_data = await self.calculate_composite_score(stock_code)
            signal = self._evaluate_decision_tree(stock_code, score_data)
            if signal:
                signals.append(signal)
        else:
            # 掃描所有股票 (限制數量)
            stmt = select(Stock.code).limit(100)
            result = await self.db.execute(stmt)
            codes = [r[0] for r in result.all()]

            for code in codes:
                try:
                    score_data = await self.calculate_composite_score(code)
                    signal = self._evaluate_decision_tree(code, score_data)
                    if signal:
                        signals.append(signal)
                except Exception:
                    continue

        # 過濾等級
        if level != "all":
            signals = [s for s in signals if s["level"] == level]

        return signals

    def _evaluate_decision_tree(self, stock_code: str, score_data: dict) -> Optional[dict]:
        """
        決策樹評估
        基於多層條件判斷產生訊號
        整合 K 線形態因子作為輔助判斷
        """
        total = score_data["total_score"]
        tech = score_data["technical_score"]
        chip = score_data["chip_score"]
        sentiment = score_data["sentiment_score"]
        fundamental = score_data["fundamental_score"]
        pattern_norm = score_data.get("pattern_norm", 50)
        recent_patterns = score_data.get("recent_patterns", [])

        # 提取近期形態名稱
        pattern_names = [p.get("name", "") for p in recent_patterns[:3]] if recent_patterns else []

        # K 線形態輔助判斷
        pattern_bullish = pattern_norm >= 65  # 多頭形態
        pattern_bearish = pattern_norm <= 35   # 空頭形態

        # 第一層: 總分過濾 + 形態確認
        if total >= 75:
            if pattern_bullish:
                level = "strong"
                action = "strong_buy"
                pattern_hint = f"，形態訊號：{', '.join(pattern_names)}" if pattern_names else ""
                reason = f"綜合評分 {total} 分，各項指標強勁{pattern_hint}"
            elif pattern_bearish:
                level = "watch"
                action = "caution"
                reason = f"綜合評分 {total} 分但出現空頭形態({', '.join(pattern_names)})，建議謹慎"
            else:
                level = "strong"
                action = "buy"
                reason = f"綜合評分 {total} 分，各項指標強勁"
        elif total >= 60:
            if pattern_bullish:
                level = "strong"
                action = "buy"
                pattern_hint = f"，形態訊號：{', '.join(pattern_names)}" if pattern_names else ""
                reason = f"綜合評分 {total} 分，具備投資價值{pattern_hint}"
            elif pattern_bearish:
                level = "watch"
                action = "watch"
                reason = f"綜合評分 {total} 分但形態偏弱，建議觀望"
            else:
                level = "strong"
                action = "buy"
                reason = f"綜合評分 {total} 分，具備投資價值"
        elif total <= 25:
            if pattern_bearish:
                level = "sell"
                action = "strong_sell"
                pattern_hint = f"，形態訊號：{', '.join(pattern_names)}" if pattern_names else ""
                reason = f"綜合評分 {total} 分，風險過高{pattern_hint}"
            elif pattern_bullish:
                level = "watch"
                action = "watch"
                reason = f"綜合評分 {total} 分但出現多頭形態，可能為超賣反彈"
            else:
                level = "sell"
                action = "strong_sell"
                reason = f"綜合評分 {total} 分，風險過高"
        elif total <= 40:
            if pattern_bearish:
                level = "sell"
                action = "sell"
                reason = f"綜合評分 {total} 分，建議避開"
            elif pattern_bullish:
                level = "watch"
                action = "watch"
                reason = f"綜合評分 {total} 分但出現多頭形態({', '.join(pattern_names)})，可觀察"
            else:
                level = "sell"
                action = "sell"
                reason = f"綜合評分 {total} 分，建議避開"
        else:
            # 第二層: 觀察區間 (40 < total < 60)，檢查個別維度 + 形態
            if tech >= 70 and chip >= 70:
                if pattern_bullish:
                    level = "strong"
                    action = "buy"
                    reason = f"技術與籌碼強勁，形態確認多頭({', '.join(pattern_names)})"
                else:
                    level = "watch"
                    action = "watch"
                    reason = f"技術與籌碼強勁，等待進場時機"
            elif tech >= 60 and pattern_bullish:
                level = "watch"
                action = "watch"
                reason = f"技術面尚可且形態多頭({', '.join(pattern_names)})，可觀察"
            elif sentiment <= 30 and pattern_bearish:
                level = "sell"
                action = "sell"
                reason = f"情緒面偏弱且形態空頭，建議避開"
            elif sentiment <= 30:
                level = "watch"
                action = "caution"
                reason = f"情緒面偏弱，建議觀望"
            else:
                return None  # 沒有明確訊號

        operation = self._build_operation_guide(score_data)

        return {
            "stock_code": stock_code,
            "level": level,
            "action": action,
            "reason": reason,
            "scores": {
                "total": total,
                "technical": tech,
                "chip": chip,
                "sentiment": sentiment,
                "fundamental": fundamental,
                "pattern": round(pattern_norm, 1),
            },
            "patterns": pattern_names,
            "operation": operation,
            "generated_at": datetime.now().isoformat(),
        }

    def _build_operation_guide(self, score_data: dict) -> Optional[dict]:
        """根據 ATR 與壓力位產生操作建議"""
        current_price = score_data.get("current_price")
        atr = score_data.get("atr_14")
        resistance = score_data.get("resistance")
        support = score_data.get("support")

        if not current_price or not atr or atr <= 0:
            return None

        stop_loss = round(current_price - 1.5 * atr, 1)
        # 目標：近期壓力位（若高於現價）或 +5%
        if resistance and resistance > current_price * 1.005:
            target = round(resistance, 1)
        else:
            target = round(current_price * 1.05, 1)

        risk = current_price - stop_loss
        reward = target - current_price
        rr_ratio = round(reward / risk, 1) if risk > 0 else 0

        return {
            "entry_note": f"參考進場區間 {round(current_price * 0.998, 1)}–{round(current_price * 1.002, 1)}",
            "stop_loss": stop_loss,
            "stop_loss_pct": round((stop_loss - current_price) / current_price * 100, 1),
            "target": target,
            "target_pct": round((target - current_price) / current_price * 100, 1),
            "rr_ratio": rr_ratio,
            "hold_period": "波段（2–4 週）",
        }

    async def get_recommendations(self, min_score: int = 70, limit: int = 10) -> list[dict]:
        """
        每日推薦潛力股
        基於多因子評分篩選
        """
        stmt = select(Stock.code).limit(200)
        result = await self.db.execute(stmt)
        codes = [r[0] for r in result.all()]

        recommendations = []
        for code in codes:
            try:
                score_data = await self.calculate_composite_score(code)
                if score_data["total_score"] >= min_score:
                    recommendations.append(score_data)
            except Exception:
                continue

            if len(recommendations) >= limit:
                break

        # 依分數排序
        recommendations.sort(key=lambda x: x["total_score"], reverse=True)

        return recommendations
