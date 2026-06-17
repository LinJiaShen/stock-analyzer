"""
交易成本（手續費 + 證交稅）純函式測試
"""
from app.services import trading_costs as tc


def test_buy_fee_basic():
    # 100 元 × 1 張 × 1000 股 = 100,000；手續費 = floor(100000 × 0.001425) = 142
    assert tc.buy_fee(100, 1) == 142


def test_buy_fee_minimum_applies():
    # 10 元 × 1 張 = 10,000；手續費 = floor(14.25) = 14 → 低於 20，套用最低 20
    assert tc.buy_fee(10, 1) == 20


def test_buy_fee_discount():
    # 折數 0.6：floor(142.5 × 0.6) = floor(85.5) = 85
    assert tc.buy_fee(100, 1, discount=0.6) == 85


def test_sell_fee_includes_tax():
    # 110,000：手續費 floor(156.75)=156 + 證交稅 floor(330)=330 = 486
    assert tc.sell_fee(110, 1) == 486


def test_sell_fee_day_trade_tax_halved():
    # 當沖證交稅 0.15%：手續費 156 + floor(165)=165 = 321
    assert tc.sell_fee(110, 1, day_trade=True) == 321


def test_round_trip_fee():
    # 買 142 + 賣 486 = 628
    assert tc.round_trip_fee(100, 110, 1) == 628


def test_net_realized_pnl_win():
    # 毛利 (110-100)×1000 = 10,000；扣來回 628 → 9,372
    assert tc.net_realized_pnl(100, 110, 1) == 9372


def test_net_realized_pnl_loss():
    # 毛損 -5,000；買 142 + 賣(135+285=420) = 562 → -5,562
    assert tc.net_realized_pnl(100, 95, 1) == -5562


def test_net_realized_pnl_multi_lot():
    # 3 張：毛利 30,000；買 427 + 賣(470+990=1460) = 1,887 → 28,113
    assert tc.net_realized_pnl(100, 110, 3) == 28113


def test_net_realized_pnl_with_discount():
    # 折數 0.6：買 85 + 賣(94+330=424) = 509；毛利 10,000 → 9,491
    assert tc.net_realized_pnl(100, 110, 1, discount=0.6) == 9491


def test_zero_lots_no_fee():
    assert tc.buy_fee(100, 0) == 0
    assert tc.sell_fee(100, 0) == 0
