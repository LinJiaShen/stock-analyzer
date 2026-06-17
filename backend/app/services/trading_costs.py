"""
台股交易成本計算（手續費 + 證交稅）

模擬單原本只算毛利，與真實報酬脫節。本模組提供純函式計算台股實際成本：

- 手續費：成交金額 × 0.1425%（買賣雙邊都收），最低 20 元；可乘券商折數 discount。
- 證交稅：成交金額 × 0.3%（僅賣出收），當沖減半為 0.15%。

金額單位 = 元，數量單位 = 張（1 張 = 1000 股）。
費用以無條件捨去（floor）至整數元，貼近券商對帳單。

設計為無狀態純函式，方便單元測試與在 router / worker 各 P&L 計算點重用。
"""
import math

COMMISSION_RATE = 0.001425   # 手續費率（單邊）
MIN_COMMISSION = 20          # 最低手續費（元）
TAX_RATE = 0.003             # 證交稅率（賣出）
DAY_TRADE_TAX_RATE = 0.0015  # 當沖證交稅率（減半）
SHARES_PER_LOT = 1000        # 1 張 = 1000 股


def _commission(value: float, discount: float) -> int:
    """手續費 = 成交金額 × 0.1425% × 折數，最低 20 元。無成交金額則為 0。"""
    if value <= 0:
        return 0
    return max(math.floor(value * COMMISSION_RATE * discount), MIN_COMMISSION)


def buy_fee(price: float, lots: float, discount: float = 1.0) -> int:
    """買進手續費（元）。"""
    return _commission(price * lots * SHARES_PER_LOT, discount)


def sell_fee(price: float, lots: float, discount: float = 1.0, day_trade: bool = False) -> int:
    """賣出成本（元）= 手續費 + 證交稅。"""
    value = price * lots * SHARES_PER_LOT
    if value <= 0:
        return 0
    tax_rate = DAY_TRADE_TAX_RATE if day_trade else TAX_RATE
    return _commission(value, discount) + math.floor(value * tax_rate)


def round_trip_fee(
    entry: float, exit_price: float, lots: float,
    discount: float = 1.0, day_trade: bool = False,
) -> int:
    """一買一賣的完整來回成本（元）。"""
    return buy_fee(entry, lots, discount) + sell_fee(exit_price, lots, discount, day_trade)


def net_realized_pnl(
    entry: float, exit_price: float, lots: float,
    discount: float = 1.0, day_trade: bool = False,
) -> float:
    """扣除來回成本後的已實現損益（元）。"""
    gross = (exit_price - entry) * lots * SHARES_PER_LOT
    return gross - round_trip_fee(entry, exit_price, lots, discount, day_trade)
