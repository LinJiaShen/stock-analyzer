# 台股分析系統 — 改善計畫技術文件

> 撰寫角色：資深投資分析師 + 系統架構師  
> 文件日期：2026-06-11  
> 對象：負責本系統開發的工程師  
> 目標：將系統從「展示架構」升級為「可日常使用的投資決策工具」

---

## 目錄

1. [現狀評估](#1-現狀評估)
2. [P0 — 假數據必須全部替換](#2-p0--假數據必須全部替換)
3. [P1 — 核心分析功能補強](#3-p1--核心分析功能補強)
4. [P2 — 缺失的基礎功能](#4-p2--缺失的基礎功能)
5. [P3 — 長期策略改善](#5-p3--長期策略改善)
6. [評分模型重構建議](#6-評分模型重構建議)
7. [資料來源建議](#7-資料來源建議)
8. [實作優先順序總表](#8-實作優先順序總表)

---

## 1. 現狀評估

### 1.1 系統已有的能力

| 功能 | 狀態 | 備註 |
|------|------|------|
| K 線圖（日/週/月/5分） | ✅ 可用 | Yahoo Finance 提供歷史資料 |
| 技術指標（RSI/MACD/KDJ/BB） | ✅ 後端可算 | 前端只顯示數值，未視覺化 |
| 籌碼原始數據（三大法人/融資） | ✅ 後端有 | 前端呈現陽春 |
| 多因子評分（0-100） | ✅ 後端可算 | 前端呈現薄弱 |
| 雷達圖 | ✅ 可用 | |
| WebSocket 即時價格 | ✅ 已實作 | 僅限開盤時間 |
| 持倉管理 | ✅ 可用 | 缺風險分析 |

### 1.2 現在最大的問題

**超過一半的頁面顯示的是寫死的假資料**，使用者以為在看真實分析，實際上看的是開發時的佔位數據。這是所有問題中最緊急的。

```
frontend/src/app/decision/page.tsx      → 全部假資料（只有 2330/2454/3034）
frontend/src/app/pre-market/page.tsx    → enabled: false，國際指數全假
frontend/src/app/sentiment/page.tsx     → 全部假資料
frontend/src/app/after-market/page.tsx  → 三大法人假資料
frontend/src/app/intraday/page.tsx      → K 線起始點寫死 18420
```

---

## 2. P0 — 假數據必須全部替換

### 2.1 決策評分頁 (`/decision`)

**問題**：整頁硬編碼，換任何股票顯示的都是固定內容。

**現有後端 API（已可使用）**：
```
GET /api/decision/score/{stock_code}
GET /api/decision/radar/{stock_code}
GET /api/decision/signals?stock_code={code}
```

**`score` 回傳格式**：
```json
{
  "stock_code": "2330",
  "total_score": 72.5,
  "technical_score": 78,
  "chip_score": 68,
  "fundamental_score": 60,
  "sentiment_score": 65,
  "pattern_score": 15,
  "pattern_norm": 57.5,
  "health_level": "good",
  "recent_patterns": [
    { "name": "看漲吞噬", "score": 15, "index": 119 }
  ],
  "analyzed_at": "2026-06-11T..."
}
```

**`radar` 回傳格式**：
```json
{
  "stock_code": "2330",
  "radar": { "value": 50, "momentum": 78, "chip": 68, "growth": 65, "resistance": 75 }
}
```

**`signals` 回傳格式**：
```json
{
  "signals": [
    {
      "stock_code": "2330",
      "level": "strong",
      "action": "buy",
      "reason": "綜合評分 72.5 分，各項指標強勁",
      "scores": { "total": 72.5, "tech": 78, "chip": 68 }
    }
  ]
}
```

**實作要求**：

```tsx
// 替換 decision/page.tsx 中的 mockScores / mockRadar / mockSignals
// 改用 useQuery 呼叫三個 API
// 注意：signals API 可能回傳空陣列（沒有明確訊號時），要有 empty state 處理

const { data: scoreData, isLoading: scoreLoading } = useQuery({
  queryKey: ["decision-score", selectedCode],
  queryFn: () => api.get(`/api/decision/score/${selectedCode}`).then(r => r.data),
  staleTime: 5 * 60 * 1000,
});

const { data: radarData } = useQuery({
  queryKey: ["radar", selectedCode],
  queryFn: () => api.get(`/api/decision/radar/${selectedCode}`).then(r => r.data),
  staleTime: 5 * 60 * 1000,
});

const { data: signalData } = useQuery({
  queryKey: ["signals", selectedCode],
  queryFn: () => api.get(`/api/decision/signals?stock_code=${selectedCode}`).then(r => r.data),
  staleTime: 5 * 60 * 1000,
});
```

**訊號等級對應顯示**：

| `level` 值 | 顯示文字 | 顏色 |
|---|---|---|
| `strong` + `action: buy` | 強力買入 | 深綠 |
| `strong` + `action: strong_buy` | 積極買入 | 深綠 |
| `watch` | 觀察 | 黃 |
| `sell` | 賣出 | 紅 |
| `sell` + `action: strong_sell` | 強力賣出 | 深紅 |
| 空陣列 | 目前無明確訊號 | 灰 |

---

### 2.2 盤前分析頁 (`/pre-market`)

**問題**：`useQuery` 的 `enabled: false`，以及大量寫死數據。

**需要的真實資料**：

1. **國際指數**：後端沒有現成 API，建議使用 Yahoo Finance 的指數代碼：
   - 道瓊：`^DJI`、納斯達克：`^IXIC`、S&P500：`^GSPC`
   - 日經：`^N225`、恆生：`^HSI`
   - 在 `worker/yahoo_worker.py` 新增 `fetch_indices()` 函式，排程每天 08:00 抓取

2. **ADR 表現**：用 Yahoo Finance 抓 `TSM`、`UMC`、`ASX`、`HIMX` 等台股 ADR
   - 建議新增 `GET /api/stocks/adr-performance` 端點

3. **暫時可行的方案**（在後端完成前）：
   - 在前端直接用 Yahoo Finance 非官方 API 抓即時指數（開盤前靜態資料即可）
   - 或：使用 `staleTime: 4 * 60 * 60 * 1000`，每4小時重抓一次

**`enabled: false` 要改成 `enabled: true`，並修正 API path**：
```tsx
// 錯誤：api.get("/stocks/pre-market")
// 正確：api.get("/api/stocks/pre-market")
```

---

### 2.3 情緒分析頁 (`/sentiment`)

**問題**：`newsSentimentData`、`keywords`、`sentimentResult` 全是寫死數據。

**現有後端 API**：
```
GET /api/analysis/sentiment/{stock_code}
```

**回傳格式**（參考 `analysis.py`）：
```json
{
  "stock_code": "2330",
  "score": 68,
  "signal": "正面",
  "news_sentiment": {
    "positive_ratio": 0.65,
    "negative_ratio": 0.12,
    "neutral_ratio": 0.23,
    "news_count": 45,
    "keywords": ["AI", "先進製程"],
    "trend": "上升"
  }
}
```

**實作要求**：
```tsx
// 替換所有 mock 數據，改用：
const { data: sentimentData, isLoading } = useQuery({
  queryKey: ["sentiment", selectedCode],
  queryFn: () => api.get(`/api/analysis/sentiment/${selectedCode}`).then(r => r.data),
  staleTime: 10 * 60 * 1000,
});
```

**注意**：情緒數據依賴新聞爬蟲（`worker/`），若當天新聞資料庫是空的，要有 "暫無新聞資料" 的 empty state，**不要** fallback 回假資料。

---

### 2.4 盤後分析頁 (`/after-market`)

**問題**：三大法人假資料。

**建議**：三大法人當日買賣超需要 TWSE API（下午 3:30 後才有）。  
短期解法：對有持倉的股票，呼叫 `GET /api/stocks/{code}/chip?days=1`，取得最新一日的籌碼資料。

```tsx
// 先從持倉清單取得 stock_codes，再批量查詢
const { data: holdings } = useQuery({ queryKey: ["holdings"], ... });

const chipQueries = useQueries({
  queries: (holdings || []).map(h => ({
    queryKey: ["chip-today", h.stock_code],
    queryFn: () => api.get(`/api/stocks/${h.stock_code}/chip?days=2`).then(r => r.data?.data?.[0]),
  }))
});
```

---

### 2.5 盤中頁 (`/intraday`)

**問題**：K 線起始值寫死（`18420`）、大盤數據假資料、WebSocket 只訂閱台積電。

**改善方向**：
1. 移除寫死的初始 `klineData` 陣列，改為空陣列 `[]`，讓 WebSocket 推送第一筆才開始顯示
2. 大盤指數（加權/OTC）需要串接 TWSE 即時 API —— 這是後端工作，暫時可以從 WebSocket 拿到的個股推算，或移除大盤數字顯示
3. 新增股票搜尋/切換功能（不要寫死台積電）

---

## 3. P1 — 核心分析功能補強

### 3.1 個股頁頭部補強（`/stock/[code]`）

**目前只有**：股名、即時價格、漲跌幅、綜合評分  
**需要新增**：

| 欄位 | 資料來源 | 備註 |
|---|---|---|
| 52 週高低點 | `GET /api/stocks/{code}/kline?interval=1d&limit=252` | 取 max(high), min(low) |
| 市值（億） | 需要基本面 API | 目前後端沒有，見 §7 |
| 本益比 | 需要基本面 API | 目前後端沒有 |
| 殖利率 | 需要基本面 API | 目前後端沒有 |
| 成交量（今日） | K 線最新一筆 volume | 後端已有 |

**52 週高低的快速實作**（不需要新 API）：

```tsx
// 在 fetchKline 成功後計算
const week52High = Math.max(...klineData.map(d => d.high));
const week52Low = Math.min(...klineData.map(d => d.low));

// 顯示目前價格在高低區間的位置（0%=低點, 100%=高點）
const pricePosition = ((currentPrice - week52Low) / (week52High - week52Low)) * 100;
```

**UI 建議**：用一個橫向 range bar 顯示當前價位在 52 週區間的位置，直覺好用。

---

### 3.2 評分必須附解釋

**現在**：顯示「技術面 78 分」  
**應該**：顯示「技術面 78 分 — RSI=58 中性偏強、MACD 黃金交叉、均線多頭排列」

**後端**：`GET /api/analysis/technical/{stock_code}` 已回傳完整指標數據，不需要新 API。  
**前端**：在 `ScoreBreakdownCard` 元件中，對每個維度展開說明文字。

**`/api/analysis/technical/{code}` 關鍵欄位**：
```json
{
  "score": 78,
  "signal": "買入",
  "rsi": 58.3,
  "macd": { "macd_line": 2.1, "signal_line": 1.8, "histogram": 0.3 },
  "ma_alignment": "bullish",
  "trend": { "direction": "up", "strength": 0.72 },
  "bollinger": { "upper": 610, "middle": 585, "lower": 560 },
  "bollinger_position": 0.65
}
```

**分數解釋生成邏輯**（前端純計算，不需要後端）：

```ts
function explainTechnicalScore(tech: TechnicalResult): string {
  const points: string[] = [];
  
  if (tech.rsi > 70) points.push(`RSI=${tech.rsi.toFixed(0)} 超買`);
  else if (tech.rsi < 30) points.push(`RSI=${tech.rsi.toFixed(0)} 超賣`);
  else points.push(`RSI=${tech.rsi.toFixed(0)} 中性`);
  
  if (tech.macd.histogram > 0) points.push("MACD 多頭");
  else points.push("MACD 空頭");
  
  if (tech.ma_alignment === "bullish") points.push("均線多頭排列");
  else if (tech.ma_alignment === "bearish") points.push("均線空頭排列");
  
  if (tech.bollinger_position !== undefined) {
    if (tech.bollinger_position > 0.8) points.push("接近布林上軌");
    else if (tech.bollinger_position < 0.2) points.push("接近布林下軌");
  }
  
  return points.join("、");
}
```

對籌碼面、情緒面也套用相同邏輯，讓每個維度的分數都有 1-2 行說明。

---

### 3.3 籌碼分析：加入連續性與趨勢

**現在**：顯示當日買賣超的數字  
**應該**：顯示「外資連續 7 天買超，累計 +4.2 億張」

**後端**：`GET /api/stocks/{code}/chip?days=20` 已回傳 20 天原始數據  
**前端**：在前端計算連續性

```ts
function calcConsecutive(data: ChipDataPoint[], field: "foreign_net" | "trust_net") {
  let consecutive = 0;
  let cumulative = 0;
  
  // 從最新往前算
  for (let i = data.length - 1; i >= 0; i--) {
    const val = data[i][field] ?? 0;
    if (i === data.length - 1) {
      // 第一天決定方向
      if (val === 0) break;
      consecutive = val > 0 ? 1 : -1;
      cumulative = val;
    } else {
      if (val > 0 && consecutive > 0) { consecutive++; cumulative += val; }
      else if (val < 0 && consecutive < 0) { consecutive--; cumulative += val; }
      else break;
    }
  }
  
  return { days: Math.abs(consecutive), direction: consecutive > 0 ? "買超" : "賣超", cumulative };
}
```

**顯示格式**：「外資連買 7 天 / 累計 +4.2 億」（連賣用紅色）

---

### 3.4 決策訊號加入操作建議

**現在**：輸出「買入，綜合評分 72.5 分，各項指標強勁」  
**應該**：

```
建議操作：觀察進場
進場條件：明日突破 580 且成交量 > 20 日均量
停損設定：日收盤跌破 560（-3.4%），立即停損
目標區間：610-625（+5.2% ~ +7.7%）
風險報酬比：1:2.1
持有建議：波段操作，預期 2-4 週
```

**實作方式**：在後端 `_evaluate_decision_tree()` 的回傳值中新增這些欄位（見 §6.2）。

---

### 3.5 圖表上標注支撐/壓力位

**後端已有**：`/api/analysis/technical/{code}` 回傳 `support` 和 `resistance`  
**前端 `CandlestickChart` 已支援 `annotations` prop**（`TechnicalAnnotation` 型別）

目前在 `stock/[code]/page.tsx` 中 `annotations` 狀態永遠是空陣列。只需要：

```tsx
// 在 fetchKline/fetchScore 成功後設定 annotations
useEffect(() => {
  if (!techData?.support && !techData?.resistance) return;
  const ann: TechnicalAnnotation[] = [];
  if (techData.support) ann.push({ type: "support", price: techData.support, label: `支撐 ${techData.support}` });
  if (techData.resistance) ann.push({ type: "resistance", price: techData.resistance, label: `壓力 ${techData.resistance}` });
  setAnnotations(ann);
}, [techData]);
```

---

## 4. P2 — 缺失的基礎功能

### 4.1 追蹤清單（Watchlist）

**功能描述**：使用者可以加入「想觀察」但還沒買的股票，類似股票 App 的自選股。

**後端**：新增 `models/watchlist.py` 和 `routers/watchlist.py`：

```python
# models/watchlist.py
class WatchlistItem(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    stock_code = Column(String(10), nullable=False)
    note = Column(Text, nullable=True)
    added_at = Column(DateTime, default=datetime.now)
```

```python
# routers/watchlist.py
GET  /api/watchlist/          # 取得追蹤清單
POST /api/watchlist/          # 新增 { stock_code, note }
DELETE /api/watchlist/{id}    # 移除
```

**前端**：在每個股票詳情頁加一個「+ 追蹤」按鈕（類似 bookmark icon）。  
新增 `/watchlist` 頁面，顯示所有追蹤股票的即時評分排名。

---

### 4.2 股票篩選器（Screener）

這是主動發現投資機會的核心功能。沒有這個，使用者只能查詢已知股票。

**後端**：新增 `GET /api/stocks/screen` 端點

```python
# 篩選參數
@router.get("/screen")
async def screen_stocks(
    min_score: int = Query(60),
    max_score: int = Query(100),
    min_technical: int = Query(0),
    min_chip: int = Query(0),
    foreign_consecutive_buy: int = Query(0),  # 外資連買至少 N 天
    rsi_max: float = Query(100),              # RSI 上限（找超賣用 rsi_max=35）
    rsi_min: float = Query(0),
    signal_level: str = Query("all"),         # strong / watch / sell / all
    limit: int = Query(20),
    db: AsyncSession = Depends(get_db),
):
```

**前端**：新增 `/screener` 頁面，左側篩選器，右側結果列表。  
提供幾個**預設條件組合**（常見策略入口）：

| 策略名稱 | 條件 |
|---|---|
| 外資連買強勢股 | 外資連買 ≥ 3 天、技術分 ≥ 65 |
| 超賣反彈機會 | RSI ≤ 35、總分 ≥ 55 |
| 籌碼集中爆發 | 籌碼分 ≥ 75、技術分 ≥ 60 |
| 高分觀察名單 | 總分 ≥ 75 |

---

### 4.3 評分趨勢追蹤

**問題**：「今天 72 分」沒有意義，「上週 45 分、今天 72 分（+27）」才有意義。

**後端**：新增 `models/score_history.py`，每日計算後儲存分數記錄。

```python
class ScoreHistory(Base):
    __tablename__ = "score_history"
    id = Column(Integer, primary_key=True)
    stock_code = Column(String(10))
    trade_date = Column(Date)
    total_score = Column(Numeric(5, 1))
    technical_score = Column(Numeric(5, 1))
    chip_score = Column(Numeric(5, 1))
    # ...
```

**Worker 排程**（每日收盤後 14:30 執行）：
```python
# worker/score_worker.py
async def daily_score_update():
    """計算所有股票今日評分並儲存"""
    stocks = await get_all_active_stocks()
    for code in stocks:
        score = await scoring_service.calculate_composite_score(code)
        await save_score_history(code, score)
```

**前端**：在評分顯示旁邊加入 7 日/30 日趨勢小折線圖（Sparkline）。  
`GET /api/decision/score-history/{code}?days=30`

---

### 4.4 持倉風險分析

**現在**：只有損益計算  
**需要**：

**Beta 係數**（個股對大盤的敏感度）：
```python
# 後端計算：用個股日報酬率 vs 大盤日報酬率做回歸
def calculate_beta(stock_returns: list, market_returns: list) -> float:
    cov = np.cov(stock_returns, market_returns)[0][1]
    var = np.var(market_returns)
    return cov / var if var > 0 else 1.0
```

**最大回撤**：
```python
def calculate_max_drawdown(prices: list) -> float:
    peak = prices[0]
    max_dd = 0
    for price in prices:
        peak = max(peak, price)
        drawdown = (peak - price) / peak
        max_dd = max(max_dd, drawdown)
    return max_dd
```

**組合相關性警告**：
```python
# 若組合中某產業佔比 > 50%，發出警告
# 若兩檔股票相關係數 > 0.85，發出「高度相關」警告
```

**前端**：在持倉分析頁加入「風險警示」區塊，用紅色卡片顯示：
- `"電子類佔比 82%，過度集中"`
- `"台積電與聯電相關係數 0.91，高度重疊"`
- `"整體組合 Beta=1.35，波動高於大盤 35%"`

---

## 5. P3 — 長期策略改善

### 5.1 基本面資料整合

**目前狀況**：`fundamental_score` 實際上用**成交量成長率作為 EPS 成長的代理**，這在金融上站不住腳。

**正確的基本面指標**：

| 指標 | 計算方式 | 資料來源 |
|---|---|---|
| 本益比（PE） | 股價 / EPS（TTM） | TWSE 財報 API |
| 股價淨值比（PB） | 股價 / 每股淨值 | TWSE 財報 API |
| 殖利率 | 年度股利 / 股價 | TWSE 公告 |
| EPS 成長率 | (本季EPS - 去年同季EPS) / |去年同季EPS| | TWSE 財報 API |
| ROE | 淨利 / 股東權益 | TWSE 財報 API |

**TWSE 財報 API 端點**：
```
https://mops.twse.com.tw/mops/web/t51sb01  # 損益表
https://mops.twse.com.tw/mops/web/t51sb02  # 資產負債表
```

**Worker 新增**：`worker/fundamental_worker.py`，每季爬取財報後儲存至新資料表 `fundamental_data`。

**評分重構**（完成財報整合後）：
```python
# 基本面評分邏輯（替換現有的成交量代理）
def calculate_fundamental_score(data):
    score = 50  # 基礎分
    
    # EPS 成長（±20分）
    if data.eps_growth > 0.30: score += 20
    elif data.eps_growth > 0.15: score += 12
    elif data.eps_growth < -0.15: score -= 15
    
    # 估值水位（±15分）
    # PE 相對同業平均，非絕對值
    if data.pe_vs_sector < 0.7: score += 15  # 低估
    elif data.pe_vs_sector > 1.5: score -= 10  # 高估
    
    # ROE（±15分）
    if data.roe > 0.20: score += 15
    elif data.roe > 0.12: score += 8
    elif data.roe < 0.05: score -= 10
    
    return max(0, min(100, score))
```

---

### 5.2 評分模型重構（Factor Model）

**現在的問題**：簡單加權平均，沒有處理因子相關性、沒有時間衰減、沒有市場環境調整。

**建議的改良方向**：

#### 5.2.1 因子相關性去除（正交化）

技術面和籌碼面高度相關（外資買進 → 股價拉升 → 技術面轉強），直接加總會重複計算。

```python
# 簡單解法：降低相關性高的因子權重
# 進階解法：使用 PCA 或 Gram-Schmidt 正交化
```

#### 5.2.2 市場狀態濾鏡

```python
def get_market_regime(twii_ma20: float, twii_current: float) -> str:
    if twii_current > twii_ma20 * 1.03:
        return "bull"    # 多頭市場
    elif twii_current < twii_ma20 * 0.97:
        return "bear"    # 空頭市場
    return "neutral"

# 根據市場狀態調整各因子權重
WEIGHTS_BY_REGIME = {
    "bull":    {"technical": 0.35, "chip": 0.25, "fundamental": 0.15, "sentiment": 0.15, "pattern": 0.10},
    "bear":    {"technical": 0.20, "chip": 0.30, "fundamental": 0.25, "sentiment": 0.10, "pattern": 0.15},
    "neutral": {"technical": 0.30, "chip": 0.20, "fundamental": 0.15, "sentiment": 0.15, "pattern": 0.20},
}
```

#### 5.2.3 時間衰減（近期數據權重更高）

```python
# 技術指標：近 5 日的訊號比 20 日前更重要
def time_weighted_score(scores: list, half_life: int = 5) -> float:
    weights = [0.5 ** (i / half_life) for i in range(len(scores) - 1, -1, -1)]
    return sum(s * w for s, w in zip(scores, weights)) / sum(weights)
```

---

### 5.3 訊號勝率統計（模型可信度）

沒有歷史勝率，任何訊號都只是意見而非依據。

**實作流程**：
1. `ScoreHistory` 儲存每天的評分和訊號（§4.3 已提到）
2. 新增 `SignalOutcome` 表：
   ```python
   class SignalOutcome(Base):
       __tablename__ = "signal_outcomes"
       id = Column(Integer, primary_key=True)
       stock_code = Column(String(10))
       signal_date = Column(Date)
       action = Column(String(20))  # buy / sell / watch
       entry_price = Column(Numeric(10, 2))
       price_7d = Column(Numeric(10, 2), nullable=True)
       price_14d = Column(Numeric(10, 2), nullable=True)
       price_30d = Column(Numeric(10, 2), nullable=True)
       outcome_7d = Column(Numeric(5, 2), nullable=True)  # 7日後報酬率
   ```
3. Worker 每日計算 7/14/30 天後的結果，填入 `outcome_*` 欄位
4. 前端展示：「過去 6 個月 "買入" 訊號，7 日後平均報酬 +2.3%，勝率 62%（n=87）」

---

### 5.4 警報系統

**後端**：新增 `models/alert.py` 和 WebSocket 推送機制

```python
class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    stock_code = Column(String(10))
    alert_type = Column(String(20))  # price_above / price_below / score_change / signal
    threshold = Column(Numeric(10, 2))
    is_triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime, nullable=True)
```

```python
# Worker 每分鐘檢查（盤中）
async def check_alerts(latest_prices: dict):
    alerts = await get_active_alerts()
    for alert in alerts:
        price = latest_prices.get(alert.stock_code)
        if alert.alert_type == "price_above" and price >= alert.threshold:
            await trigger_alert(alert)
            await push_notification(alert.user_id, f"{alert.stock_code} 突破 {alert.threshold}")
```

**前端**：在個股頁加入「設定警報」按鈕，填寫觸發條件和通知方式（App 通知 / Email）。

---

## 6. 評分模型重構建議

### 6.1 決策訊號加入量化操作建議

**修改位置**：`backend/app/services/scoring.py` 的 `_evaluate_decision_tree()`

**新增計算邏輯**（需要 `DailyBar` 的最近資料）：

```python
async def _evaluate_decision_tree(self, stock_code: str, score_data: dict) -> Optional[dict]:
    """
    決策樹評估，新增量化操作建議
    """
    # ... 現有邏輯 ...
    
    # === 新增：量化操作建議 ===
    bars = await self.tech_service._fetch_bars(stock_code, days=30)
    if bars:
        current_price = float(bars[-1].adjusted_close or bars[-1].close_price)
        
        # ATR-based 停損（1.5 ATR 作為停損緩衝）
        atr = self._calculate_atr(bars, period=14)
        stop_loss = round(current_price - 1.5 * atr, 1)
        
        # 壓力位作為目標（從技術分析取得）
        technical = score_data.get("_technical_detail", {})
        resistance = technical.get("resistance", current_price * 1.05)
        target = round(resistance, 1)
        
        # 風險報酬比
        risk = current_price - stop_loss
        reward = target - current_price
        rr_ratio = round(reward / risk, 1) if risk > 0 else 0
        
        operation_detail = {
            "entry_note": f"觀察 {round(current_price * 1.005, 1)} 附近突破確認後進場",
            "stop_loss": stop_loss,
            "stop_loss_pct": round((stop_loss - current_price) / current_price * 100, 1),
            "target": target,
            "target_pct": round((target - current_price) / current_price * 100, 1),
            "rr_ratio": rr_ratio,
            "hold_period": "波段（2-4 週）",
        }
    else:
        operation_detail = None
    
    return {
        # ... 現有欄位 ...
        "operation": operation_detail,
    }
```

**前端顯示**（在 `ScoreBreakdownCard` 下方新增 `OperationGuideCard`）：

```tsx
interface OperationGuide {
  entry_note: string;
  stop_loss: number;
  stop_loss_pct: number;
  target: number;
  target_pct: number;
  rr_ratio: number;
  hold_period: string;
}

function OperationGuideCard({ data }: { data: OperationGuide }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">操作建議</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <div className="text-xs text-blue-500">進場參考</div>
          <div className="font-bold text-blue-700">{data.entry_note}</div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg text-center">
          <div className="text-xs text-red-500">停損</div>
          <div className="font-bold text-red-700">{data.stop_loss}</div>
          <div className="text-xs text-red-400">{data.stop_loss_pct}%</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <div className="text-xs text-green-500">目標</div>
          <div className="font-bold text-green-700">{data.target}</div>
          <div className="text-xs text-green-400">+{data.target_pct}%</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>風險報酬比 1:{data.rr_ratio}</span>
        <span>{data.hold_period}</span>
      </div>
    </div>
  );
}
```

---

## 7. 資料來源建議

### 7.1 現有資料缺口

| 資料類型 | 目前狀態 | 建議來源 |
|---|---|---|
| 基本面（PE/PB/EPS） | ❌ 缺失 | TWSE MOPS、公開資訊觀測站 |
| 股利資料 | ❌ 缺失 | TWSE API |
| 國際指數（即時） | ❌ 缺失 | Yahoo Finance |
| ADR 價格 | ❌ 缺失 | Yahoo Finance |
| 大盤即時指數 | ❌ 缺失 | TWSE 即時 API |
| PTT/股版情緒 | ❌ 缺失 | PTT RSS / 爬蟲 |
| 法人持股比例（季報） | ❌ 缺失 | TWSE 公告 |

### 7.2 可立即使用的 API

**Yahoo Finance（已有 `yahoo_worker.py`）**：
```python
# 在 yahoo_worker.py 中新增
import yfinance as yf

def fetch_tw_indices():
    """抓台灣相關指數"""
    symbols = {"^TWII": "加權指數", "^TWOII": "OTC 指數"}
    result = {}
    for symbol, name in symbols.items():
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1d")
        if not hist.empty:
            result[name] = {
                "value": float(hist["Close"].iloc[-1]),
                "change": float(hist["Close"].iloc[-1] - hist["Open"].iloc[-1]),
            }
    return result

def fetch_fundamental(stock_code: str):
    """抓取基本面指標"""
    ticker = yf.Ticker(f"{stock_code}.TW")
    info = ticker.info
    return {
        "pe_ratio": info.get("trailingPE"),
        "pb_ratio": info.get("priceToBook"),
        "dividend_yield": info.get("dividendYield"),
        "market_cap": info.get("marketCap"),
        "eps": info.get("trailingEps"),
    }
```

**注意**：Yahoo Finance 非官方 API，可能不穩定，生產環境應考慮使用付費資料源（如 Fugle、TEJ）。

---

## 8. 實作優先順序總表

| 優先級 | 任務 | 修改檔案 | 工時估計 | 依賴 |
|---|---|---|---|---|
| **P0** | decision/page.tsx 接真 API | `frontend/src/app/decision/page.tsx` | 2h | — |
| **P0** | sentiment/page.tsx 接真 API | `frontend/src/app/sentiment/page.tsx` | 1h | — |
| **P0** | after-market/page.tsx 接真 API | `frontend/src/app/after-market/page.tsx` | 2h | — |
| **P0** | pre-market 修正 API path + enabled:true | `frontend/src/app/pre-market/page.tsx` | 1h | — |
| **P0** | intraday 移除寫死初始值 | `frontend/src/app/intraday/page.tsx` | 1h | — |
| **P1** | 個股頁補 52週高低 + 量 | `stock/[code]/page.tsx` | 3h | — |
| **P1** | 評分附解釋文字 | `ScoreBreakdownCard.tsx` + `scoring.py` | 4h | — |
| **P1** | 籌碼連續性計算 | `chip/page.tsx`, `stock/[code]/page.tsx` | 3h | — |
| **P1** | 圖表標注支撐/壓力位 | `stock/[code]/page.tsx` | 2h | — |
| **P1** | 決策訊號加入操作建議 | `scoring.py`, `OperationGuideCard.tsx` (新) | 6h | — |
| **P2** | 追蹤清單後端 | `models/watchlist.py`, `routers/watchlist.py` (新) | 4h | — |
| **P2** | 追蹤清單前端 | `/watchlist/page.tsx` (新) | 4h | watchlist 後端 |
| **P2** | 股票篩選器後端 | `routers/stocks.py` 新增 `/screen` | 6h | — |
| **P2** | 股票篩選器前端 | `/screener/page.tsx` (新) | 8h | screener 後端 |
| **P2** | 評分歷史儲存 | `models/score_history.py`, `worker/score_worker.py` (新) | 6h | — |
| **P2** | 評分趨勢顯示 | `ScoreBreakdownCard.tsx` | 3h | 評分歷史 |
| **P2** | 持倉 Beta + 相關性 | `holdings/analysis/page.tsx`, `scoring.py` | 6h | — |
| **P3** | 基本面資料爬蟲 | `worker/fundamental_worker.py` (新) | 10h | — |
| **P3** | 評分模型加入市場狀態 | `scoring.py` | 8h | — |
| **P3** | 訊號勝率統計系統 | `models/signal_outcome.py` + worker | 10h | 評分歷史 |
| **P3** | 警報系統 | `models/alert.py`, `routers/alert.py` (新) | 12h | WebSocket |

### 建議開發順序

```
Sprint 1（P0，目標：消除假數據）
  → decision page, sentiment page, after-market page, pre-market page, intraday page

Sprint 2（P1，目標：讓分析結果可操作）
  → 評分附解釋 + 操作建議 + 52週高低 + 支撐壓力位視覺化 + 籌碼連續性

Sprint 3（P2 前半，目標：主動發現機會）
  → Watchlist + Screener（後端 + 前端）

Sprint 4（P2 後半，目標：風險管理）
  → 評分歷史 + 評分趨勢 + 持倉 Beta/相關性警告

Sprint 5+（P3，目標：模型可信度與基本面）
  → 基本面資料 + 訊號勝率 + 模型市場狀態調整 + 警報系統
```

---

## 附錄：現有 API 完整列表（供前端對照使用）

```
# 股票基本
GET /api/stocks/                          # 所有股票列表
GET /api/stocks/{code}                    # 個股基本資訊
GET /api/stocks/{code}/kline              # K 線資料（params: interval, limit）
GET /api/stocks/{code}/chip               # 籌碼原始數據（params: days）
GET /api/stocks/{code}/industry           # 產業資訊

# 分析
GET /api/analysis/technical/{code}        # 技術指標（params: period, interval）
GET /api/analysis/chip/{code}             # 籌碼分析（params: days）
GET /api/analysis/sentiment/{code}        # 情緒分析
GET /api/analysis/industry/{code}         # 產業分析
GET /api/analysis/overview/{code}         # 綜合概覽

# 決策
GET /api/decision/score/{code}            # 多因子評分
GET /api/decision/radar/{code}            # 雷達圖數據
GET /api/decision/signals                 # 決策訊號（params: stock_code, level）
GET /api/decision/recommendations         # 每日推薦（需登入）

# 持倉
GET  /api/holdings/                       # 持倉清單
POST /api/holdings/                       # 新增持倉
GET  /api/holdings/{id}/diagnosis         # 持倉健診

# WebSocket（盤中開盤時間）
WS /ws/stock/{code}                       # 個股即時 K 線
WS /ws/batch/{codes}                      # 批量訂閱（逗號分隔）
```
