"use client";

import { Search, TrendingUp, Loader2, Wifi, WifiOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import {
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ReferenceLine,
} from "recharts";
import CandlestickChart, { type TechnicalAnnotation } from "@/components/technical/CandlestickChart";
import { useStockWebSocket } from "@/hooks/useStockWebSocket";
import { useIsMarketOpen } from "@/hooks/useIsMarketOpen";
import api from "@/lib/api";

interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalResult {
  score: number;
  signal: string;
  ma_alignment: string;
  trend: { direction: string; strength: number };
  rsi: number;
  macd: { macd_line: number; signal_line: number; histogram: number };
  kdj: { k: number; d: number; j: number };
  bollinger: { upper: number; middle: number; lower: number };
  volume: { avg_volume: number; current_volume: number; ratio: number };
  atr?: number;
  vwap?: number;
  support?: number;
  resistance?: number;
  divergence?: string;
  bollinger_position?: number;
}

function TechnicalPageContent() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [searchCode, setSearchCode] = useState(codeFromUrl || "2330");
  const [selectedCode, setSelectedCode] = useState(codeFromUrl || "2330");
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockName, setStockName] = useState<string>("");
  const [technicalResult, setTechnicalResult] = useState<TechnicalResult | null>(null);
  const [interval, setInterval] = useState<"1d" | "1w" | "1mo">("1d");
  const isMarketOpen = useIsMarketOpen();

  // WebSocket 即時價格更新處理
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === "candle_update" && message.data) {
      const { close, high, low, volume, open_time } = message.data;
      const todayStr = new Date(open_time).toLocaleDateString("zh-TW", { year: "2-digit", month: "2-digit", day: "2-digit" }).replace(/\//g, "/");

      setKlineData((prev) => {
        if (prev.length === 0) return prev;
        const lastEntry = prev[prev.length - 1];
        if (lastEntry && lastEntry.date === todayStr) {
          // 更新最後一根 K 線 (當日)
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastEntry,
            close,
            high: Math.max(lastEntry.high, high),
            low: Math.min(lastEntry.low, low),
            volume,
          };
          return updated;
        } else {
          // 新增當日的 K 線
          return [
            ...prev,
            { date: todayStr, open: close, high, low, close, volume },
          ];
        }
      });
    }
  }, []);

  // WebSocket 連線 - 僅在日線模式且台灣市場開盤時間才啟用
  const { connected, marketOpen } = useStockWebSocket({
    stockCode: selectedCode,
    interval: "daily",
    enabled: interval === "1d" && isMarketOpen,
    onMessage: handleWebSocketMessage,
  });

  const INTERVALS: { value: "1d" | "1w" | "1mo"; label: string }[] = [
    { value: "1d", label: "日線" },
    { value: "1w", label: "週線" },
    { value: "1mo", label: "月線" },
  ];

  // 獲取 K 線數據
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setTechnicalResult(null);
      setStockName("");
      try {
        // 獲取 K 線數據
        try {
          const klineRes = await api.get(`/api/stocks/${selectedCode}/kline?interval=${interval}`);
          const rawData = klineRes.data?.data || [];
          const formatted: KLineData[] = rawData.map((item: any) => ({
            date: new Date(item.date).toLocaleDateString("zh-TW", { year: "2-digit", month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
            open: item.open ?? 0,
            high: item.high ?? 0,
            low: item.low ?? 0,
            close: item.close ?? 0,
            volume: item.volume ?? 0,
          }));
          setKlineData(formatted);
        } catch {
          setKlineData([]);
        }

        // 獲取股票名稱
        try {
          const stockRes = await api.get(`/api/stocks/${selectedCode}`);
          setStockName(stockRes.data?.name || selectedCode);
        } catch {
          setStockName(selectedCode);
        }

        // 獲取技術分析結果
        try {
          const techRes = await api.get(
            `/api/analysis/technical/${selectedCode}?period=medium&interval=${interval}`
          );
          const techData = techRes.data;

          if (techData?.has_data) {
            // 後端回傳新格式：欄位直接在頂層
            const strengthPct = typeof techData.trend?.strength === "number"
              ? (techData.trend.strength <= 1 ? Math.round(techData.trend.strength * 100) : techData.trend.strength)
              : 50;
            setTechnicalResult({
              score: techData.score ?? 50,
              signal: techData.signal ?? (techData.score >= 65 ? "買入" : techData.score <= 35 ? "賣出" : "持有"),
              ma_alignment: typeof techData.ma_alignment === "string"
                ? techData.ma_alignment
                : (techData.ma_alignment?.alignment === "bullish" ? "多頭排列" : techData.ma_alignment?.alignment === "bearish" ? "空頭排列" : "交錯排列"),
              trend: {
                direction: techData.trend?.direction ?? "未知",
                strength: strengthPct,
              },
              rsi: techData.rsi ?? techData.indicators?.rsi ?? 50,
              macd: {
                macd_line: techData.macd?.macd_line ?? techData.indicators?.macd ?? 0,
                signal_line: techData.macd?.signal_line ?? techData.indicators?.macd_signal ?? 0,
                histogram: techData.macd?.histogram ?? techData.indicators?.macd_histogram ?? 0,
              },
              kdj: {
                k: techData.kdj?.k ?? techData.indicators?.kdj_k ?? 50,
                d: techData.kdj?.d ?? techData.indicators?.kdj_d ?? 50,
                j: techData.kdj?.j ?? techData.indicators?.kdj_j ?? 50,
              },
              bollinger: {
                upper: techData.bollinger?.upper ?? 0,
                middle: techData.bollinger?.middle ?? 0,
                lower: techData.bollinger?.lower ?? 0,
              },
              volume: {
                avg_volume: techData.volume?.avg_volume ?? 0,
                current_volume: techData.volume?.current_volume ?? 0,
                ratio: techData.volume?.ratio ?? 1,
              },
            });
          }
        } catch {
          // 技術分析 API 失敗，使用前端 fallback 計算
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || "無法獲取數據，請檢查股票代碼");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCode, interval]);

  // 自動產生技術標註 (基於 MA 交叉和量價分析)
  const annotations = useMemo((): TechnicalAnnotation[] => {
    if (klineData.length < 10) return [];

    const closes = klineData.map((d) => d.close);
    const volumes = klineData.map((d) => d.volume);
    const result: TechnicalAnnotation[] = [];

    // 計算 MA5 和 MA10
    const ma5 = closes.map((_, i) => {
      if (i < 4) return null;
      return closes.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5;
    });
    const ma10 = closes.map((_, i) => {
      if (i < 9) return null;
      return closes.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10;
    });

    // 偵測黃金交叉 / 死亡交叉
    for (let i = 10; i < closes.length; i++) {
      if (ma5[i] && ma10[i] && ma5[i - 1] && ma10[i - 1]) {
        // 黃金交叉: MA5 從下方穿越 MA10
        if (ma5[i - 1]! <= ma10[i - 1]! && ma5[i]! > ma10[i]!) {
          result.push({
            date: klineData[i].date,
            label: "黃金交叉",
            type: "golden_cross",
            position: "bottom",
            pattern: "MA5 上穿 MA10",
            detail: `MA5 從下方穿越 MA10 形成黃金交叉，代表短期趨勢轉強。發生日期 ${klineData[i].date}，股價 ${closes[i]} 元。建議觀察後續是否形成多頭排列。`,
          });
        }
        // 死亡交叉: MA5 從上方穿越 MA10
        if (ma5[i - 1]! >= ma10[i - 1]! && ma5[i]! < ma10[i]!) {
          result.push({
            date: klineData[i].date,
            label: "死亡交叉",
            type: "death_cross",
            position: "top",
            pattern: "MA5 下穿 MA10",
            detail: `MA5 從上方穿越 MA10 形成死亡交叉，代表短期趨勢轉弱。發生日期 ${klineData[i].date}，股價 ${closes[i]} 元。建議留意停損。`,
          });
        }
      }
    }

    // 偵測量價突破 (成交量 > 20 日均量 * 1.5)
    if (volumes.length >= 20) {
      for (let i = 20; i < volumes.length; i++) {
        const avgVol = volumes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
        if (avgVol > 0 && volumes[i] > avgVol * 1.5) {
          const isUp = closes[i] > closes[i - 1];
          if (isUp) {
            result.push({
              date: klineData[i].date,
              label: "帶量突破",
              type: "breakout",
              position: "top",
              pattern: "成交量異常放大",
              detail: `成交量 ${Math.round(volumes[i]).toLocaleString} 為 20 日均量 ${Math.round(avgVol).toLocaleString} 的 ${(volumes[i] / avgVol).toFixed(1)} 倍，配合股價上漲，屬於帶量突破型態。`,
            });
          }
        }
      }
    }

    // 回傳全部標註，由 CandlestickChart 根據 viewStart/viewEnd 自動過濾可見範圍
    return result;
  }, [klineData]);

  // 計算 RSI 數據
  const rsiData = useMemo(() => {
    if (klineData.length === 0) return [];
    const closes = klineData.map((d) => d.close);
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    let rsi = 50;
    let avgGain = 0;
    let avgLoss = 0;

    return klineData.map((d, i) => {
      if (i === 0) return { date: d.date, rsi: 50 };
      const change = changes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      if (i === 1) {
        avgGain = gain;
        avgLoss = loss;
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
      }

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
      return { date: d.date, rsi: Math.round(rsi * 10) / 10 };
    });
  }, [klineData]);

  // 計算 MACD 數據
  const macdData = useMemo(() => {
    if (klineData.length === 0) return [];
    const closes = klineData.map((d) => d.close);
    const calcEMA = (data: number[], period: number) => {
      const k = 2 / (period + 1);
      let ema = data.slice(0, Math.min(period, data.length)).reduce((a, b) => a + b, 0) / Math.min(period, data.length);
      const result: number[] = [ema];
      for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        result.push(ema);
      }
      return result;
    };

    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = calcEMA(macdLine, 9);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);

    return klineData.map((d, i) => ({
      date: d.date,
      macd: Math.round(macdLine[i] * 100) / 100,
      signal: Math.round(signalLine[i] * 100) / 100,
      histogram: Math.round(histogram[i] * 100) / 100,
    }));
  }, [klineData]);

  // 計算 KDJ 數據
  const kdjData = useMemo(() => {
    if (klineData.length === 0) return [];
    const closes = klineData.map((d) => d.close);
    const lows = klineData.map((d) => d.low);
    const highs = klineData.map((d) => d.high);

    let k = 50;
    let d = 50;

    return klineData.map((data, i) => {
      if (i === 0) return { date: data.date, k: 50, d: 50, j: 50 };

      const periodLows = lows.slice(Math.max(0, i - 5), i + 1);
      const periodHighs = highs.slice(Math.max(0, i - 5), i + 1);
      const periodCloses = closes.slice(Math.max(0, i - 5), i + 1);

      const lowest = Math.min(...periodLows);
      const highest = Math.max(...periodHighs);
      const rsv = highest === lowest ? 50 : ((periodCloses[periodCloses.length - 1] - lowest) / (highest - lowest)) * 100;

      k = (2 / 3) * k + (1 / 3) * rsv;
      d = (2 / 3) * d + (1 / 3) * k;
      const j = 3 * k - 2 * d;

      return {
        date: data.date,
        k: Math.round(k * 10) / 10,
        d: Math.round(d * 10) / 10,
        j: Math.round(Math.max(0, Math.min(100, j)) * 10) / 10,
      };
    });
  }, [klineData]);

  // 前端備用技術分析結果 (當 API 無數據時)
  const fallbackTechnicalResult = useMemo((): TechnicalResult => {
    const latestRsi = rsiData[rsiData.length - 1]?.rsi ?? 50;
    const latestMacd = macdData[macdData.length - 1];
    const latestKdj = kdjData[kdjData.length - 1];
    const closes = klineData.map((d) => d.close);
    const volumes = klineData.map((d) => d.volume);
    const highs = klineData.map((d) => d.high);
    const lows = klineData.map((d) => d.low);

    // 布林帶計算
    const ma20 = closes.slice(-20);
    const middle = ma20.length ? ma20.reduce((a, b) => a + b, 0) / ma20.length : closes[closes.length - 1];
    const stdDev = ma20.length ? Math.sqrt(ma20.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / ma20.length) : 0;
    const upper = middle + 2 * stdDev;
    const lower = middle - 2 * stdDev;

    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const currentVol = volumes[volumes.length - 1] ?? 0;

    // ATR 計算 (14 期)
    const trueRanges = [];
    for (let i = 1; i < klineData.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    const atr = trueRanges.length >= 14
      ? trueRanges.slice(-14).reduce((a, b) => a + b, 0) / 14
      : 0;

    // VWAP 計算 (使用最近 20 根 K 線)
    const vwapData = klineData.slice(-20);
    const vwap = vwapData.length
      ? vwapData.reduce((sum, d) => sum + ((d.high + d.low + d.close) / 3) * d.volume, 0)
        / vwapData.reduce((sum, d) => sum + d.volume, 0)
      : closes[closes.length - 1];

    // 支撐/壓力 (基於近期高低點)
    const recentLows = lows.slice(-20);
    const recentHighs = highs.slice(-20);
    const support = Math.min(...recentLows);
    const resistance = Math.max(...recentHighs);

    // 布林帶位置 (0-100)
    const bollingerPosition = upper !== lower
      ? ((closes[closes.length - 1] - lower) / (upper - lower)) * 100
      : 50;

    // 量價背離偵測
    let divergence = "無";
    if (closes.length >= 20) {
      const priceTrend = closes[closes.length - 1] > closes[closes.length - 20];
      const volTrend = currentVol < avgVol * 0.8;
      if (priceTrend && volTrend) divergence = "量價背離 (價漲量縮)";
      else if (!priceTrend && currentVol > avgVol * 1.2) divergence = "量價背離 (價跌量增)";
    }

    const score = latestRsi > 50 ? 60 : 40;

    return {
      score,
      signal: score >= 65 ? "買入" : score <= 35 ? "賣出" : "持有",
      ma_alignment: "交錯排列",
      trend: { direction: closes[closes.length - 1] > closes[0] ? "上升" : "下降", strength: 50 },
      rsi: latestRsi,
      macd: {
        macd_line: latestMacd?.macd ?? 0,
        signal_line: latestMacd?.signal ?? 0,
        histogram: latestMacd?.histogram ?? 0,
      },
      kdj: {
        k: latestKdj?.k ?? 50,
        d: latestKdj?.d ?? 50,
        j: latestKdj?.j ?? 50,
      },
      bollinger: {
        upper: Math.round(upper),
        middle: Math.round(middle),
        lower: Math.round(lower),
      },
      volume: {
        avg_volume: Math.round(avgVol),
        current_volume: Math.round(currentVol),
        ratio: avgVol > 0 ? currentVol / avgVol : 1,
      },
      atr: Math.round(atr * 100) / 100,
      vwap: Math.round(vwap * 100) / 100,
      support: Math.round(support * 100) / 100,
      resistance: Math.round(resistance * 100) / 100,
      divergence,
      bollinger_position: Math.round(bollingerPosition * 10) / 10,
    };
  }, [rsiData, macdData, kdjData, klineData]);

  const displayResult = technicalResult || fallbackTechnicalResult;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">技術分析</h1>
            <p className="text-sm text-gray-500">K 線圖、MA、RSI、MACD、KDJ、布林帶等多指標分析</p>
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="輸入股票代碼 (例: 2330)"
              className="pl-9 pr-4 py-2 w-48 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            分析
          </button>
        </form>
      </div>

      {/* Loading 狀態 */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center mb-6">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600">正在獲取 {selectedCode} 的技術分析數據...</p>
        </div>
      )}

      {/* 錯誤狀態 */}
      {error && !loading && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center mb-6">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-sm text-gray-500">請確認股票代碼是否正確，或稍後再試</p>
        </div>
      )}

      {/* 數據內容 */}
      {!loading && !error && (
        <>
          {/* 評分摘要 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{stockName || selectedCode} ({selectedCode}) - 技術面分析</h2>
                <p className="text-sm text-gray-500">綜合多項技術指標評分 {klineData.length} 根 K 線</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">{displayResult.score}</div>
                  <div className="text-xs text-gray-500">綜合評分</div>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                    displayResult.signal === "買入"
                      ? "bg-green-100 text-green-700"
                      : displayResult.signal === "賣出"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {displayResult.signal}
                </div>
              </div>
            </div>

            {/* 指標摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">MA 排列</div>
                <div className="text-sm font-semibold text-gray-900">{displayResult.ma_alignment}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">趨勢</div>
                <div className="text-sm font-semibold text-gray-900">
                  {displayResult.trend.direction} ({displayResult.trend.strength}%)
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">RSI (14)</div>
                <div className={`text-sm font-semibold ${displayResult.rsi > 70 ? "text-red-600" : displayResult.rsi < 30 ? "text-green-600" : "text-gray-900"}`}>
                  {displayResult.rsi.toFixed(1)}
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">量比</div>
                <div className="text-sm font-semibold text-gray-900">{displayResult.volume.ratio.toFixed(2)}x</div>
              </div>
            </div>
          </div>

      {/* K 線圖 + MA + 技術標註 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">K 線圖 · MA · 技術標註</h3>
            <span className="text-xs text-gray-400">({klineData.length} 根 K 線)</span>
            {/* WebSocket 即時狀態指示器 */}
            {interval === "1d" && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                connected
                  ? marketOpen
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-gray-50 text-gray-500 border border-gray-200"
              }`}>
                {connected ? (
                  <Wifi className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <span>
                  {connected
                    ? marketOpen
                      ? "即時更新中"
                      : "已連線 (離場)"
                    : "未連線"}
                </span>
              </div>
            )}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {INTERVALS.map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => setInterval(iv.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    interval === iv.value
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              黃金交叉
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              死亡交叉
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              突破
            </span>
          </div>
        </div>
        <CandlestickChart data={klineData} annotations={annotations} height={380} />
      </div>

      {/* 副圖指標 - RSI + KDJ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* RSI */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">RSI (相對強弱指標)</h3>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={rsiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "超買", position: "right", fill: "#ef4444", fontSize: 10 }} />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "超賣", position: "right", fill: "#22c55e", fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="rsi"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="RSI"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KDJ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">KDJ (隨機指標)</h3>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={kdjData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "超買", position: "right", fill: "#ef4444", fontSize: 10 }} />
                <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "超賣", position: "right", fill: "#22c55e", fontSize: 10 }} />
                <Line type="monotone" dataKey="k" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="K" />
                <Line type="monotone" dataKey="d" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="D" />
                <Line type="monotone" dataKey="j" stroke="#ec4899" strokeWidth={1.5} dot={false} name="J" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* MACD */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">MACD (指數平滑異同移動平均線)</h3>
        <div className="h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart data={macdData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <Bar dataKey="histogram" fill="#3b82f6" name="MACD 柱狀圖" radius={[2, 2, 0, 0]} opacity={0.6} />
              <Line type="monotone" dataKey="macd" stroke="#1e293b" strokeWidth={1.5} dot={false} name="MACD" />
              <Line type="monotone" dataKey="signal" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Signal" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* K 線決策分析 - 全寬主要段落 */}
      <div className="bg-white rounded-xl border-2 border-blue-200 shadow-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">K 線決策分析</h2>
            <p className="text-sm text-gray-500">多策略綜合評估 · 即時技術訊號</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">{displayResult.score}</div>
              <div className="text-xs text-gray-500">綜合評分</div>
            </div>
            <div
              className={`px-4 py-2 rounded-full text-base font-bold ${
                displayResult.signal === "買入"
                  ? "bg-green-100 text-green-700"
                  : displayResult.signal === "賣出"
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {displayResult.signal}
            </div>
          </div>
        </div>
    
        {/* 策略分析網格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          {/* MA 排列分析 */}
          <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm font-bold text-green-800">MA 均線排列</span>
            </div>
            <div className="text-lg font-bold text-green-700 mb-1">{displayResult.ma_alignment}</div>
            <p className="text-xs text-green-600 leading-relaxed">
              {displayResult.ma_alignment === "多頭排列"
                ? "MA5 > MA10 > MA20 > MA60，標準多頭排列，各週期趨勢一致向上，持股為宜。"
                : displayResult.ma_alignment === "空頭排列"
                ? "MA5 < MA10 < MA20 < MA60，空頭排列確認，各週期趨勢向下，避險為主。"
                : "均線交錯排列，短中長期趨勢不一致，建議等待明確方向。"}
            </p>
          </div>
    
          {/* 趨勢強度 */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-blue-800">趨勢強度分析</span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-bold text-blue-700">{displayResult.trend.direction}</span>
              <span className="text-sm text-blue-600">{displayResult.trend.strength}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${displayResult.trend.strength}%` }}
              />
            </div>
            <p className="text-xs text-blue-600">
              {displayResult.trend.strength >= 70
                ? "趨勢強勁，建議順勢操作"
                : displayResult.trend.strength >= 40
                ? "趨勢中等，可適度參與"
                : "趨勢偏弱，建議觀望"}
            </p>
          </div>
    
          {/* RSI 強弱 */}
          <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-purple-800">RSI 相對強弱</span>
            </div>
            <div className={`text-2xl font-bold mb-1 ${
              displayResult.rsi > 70 ? "text-red-600" : displayResult.rsi < 30 ? "text-green-600" : "text-purple-700"
            }`}>
              {displayResult.rsi.toFixed(1)}
            </div>
            <p className="text-xs text-purple-600">
              {displayResult.rsi > 80
                ? "嚴重超買區，回調風險極高，建議減倉"
                : displayResult.rsi > 70
                ? "超買區，留意回調風險，可適度獲利了結"
                : displayResult.rsi < 20
                ? "嚴重超賣區，反彈機會大，可考慮建倉"
                : displayResult.rsi < 30
                ? "超賣區，可能有反彈機會，留意進場訊號"
                : "中性區間，趨勢穩定，維持現況"}
            </p>
          </div>
    
          {/* MACD 訊號 */}
          <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-indigo-800">MACD 動能</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-lg font-bold ${displayResult.macd.histogram >= 0 ? "text-green-600" : "text-red-600"}`}>
                {displayResult.macd.histogram >= 0 ? "多頭" : "空頭"}
              </span>
              <span className="text-sm text-indigo-600">
                {displayResult.macd.macd_line > displayResult.macd.signal_line ? "黃金交叉" : "死亡交叉"}
              </span>
            </div>
            <p className="text-xs text-indigo-600">
              MACD({displayResult.macd.macd_line.toFixed(2)}) vs Signal({displayResult.macd.signal_line.toFixed(2)})，
              柱狀圖{displayResult.macd.histogram >= 0 ? "正" : "負"}({displayResult.macd.histogram.toFixed(2)})，
              {Math.abs(displayResult.macd.histogram) > Math.abs(displayResult.macd.macd_line) * 0.3
                ? "動能強勁"
                : "動能偏弱"}
            </p>
          </div>
    
          {/* KDJ 交叉 */}
          <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-yellow-800">KDJ 隨機指標</span>
            </div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-bold text-blue-600">K:{displayResult.kdj.k.toFixed(1)}</span>
              <span className="text-sm font-bold text-orange-600">D:{displayResult.kdj.d.toFixed(1)}</span>
              <span className="text-sm font-bold text-pink-600">J:{displayResult.kdj.j.toFixed(1)}</span>
            </div>
            <p className="text-xs text-yellow-700">
              {displayResult.kdj.k > displayResult.kdj.d
                ? "K 線上穿 D 線，短線偏多訊號"
                : "K 線下穿 D 線，短線偏空訊號"}
              ，J 值{displayResult.kdj.j > 80 ? "超買" : displayResult.kdj.j < 20 ? "超賣" : "正常"}。
            </p>
          </div>
    
          {/* 布林帶位置 */}
          <div className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-cyan-800">布林帶位置</span>
            </div>
            <div className="text-lg font-bold text-cyan-700 mb-1">
              {(displayResult.bollinger_position ?? 50).toFixed(0)}%
            </div>
            <p className="text-xs text-cyan-600">
              {(displayResult.bollinger_position ?? 50) > 85
                ? "股價靠近上軌，可能回調"
                : (displayResult.bollinger_position ?? 50) > 60
                ? "股價位於中上軌之間，偏強"
                : (displayResult.bollinger_position ?? 50) < 15
                ? "股價靠近下軌，可能反彈"
                : (displayResult.bollinger_position ?? 50) < 40
                ? "股價位於中下軌之間，偏弱"
                : "股價位於布林帶中間，趨勢不明"}
            </p>
          </div>
        </div>
    
        {/* 進階策略分析 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* 量價分析 */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-emerald-800">量價分析</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="text-center">
                <div className="text-xs text-emerald-600">均量</div>
                <div className="font-mono font-bold text-emerald-700">{(displayResult.volume.avg_volume / 1000).toFixed(0)}K</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">現量</div>
                <div className="font-mono font-bold text-emerald-700">{(displayResult.volume.current_volume / 1000).toFixed(0)}K</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">量比</div>
                <div className={`font-mono font-bold ${displayResult.volume.ratio > 1.5 ? "text-green-600" : displayResult.volume.ratio < 0.5 ? "text-red-600" : "text-emerald-700"}`}>
                  {displayResult.volume.ratio.toFixed(2)}x
                </div>
              </div>
            </div>
            <p className="text-xs text-emerald-600">
              {displayResult.volume.ratio > 2
                ? "成交量異常放大，可能有重大消息或主力進出"
                : displayResult.volume.ratio > 1.5
                ? "帶量上漲，多頭動能強勁"
                : displayResult.volume.ratio < 0.5
                ? "成交量萎縮，市場觀望情緒濃厚"
                : "成交量正常，市場交投平穩"}
            </p>
          </div>
    
          {/* 支撐/壓力 + ATR + VWAP */}
          <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-orange-800">關鍵價位</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-xs text-orange-600">支撐位</div>
                <div className="font-mono font-bold text-green-600">{displayResult.support ?? displayResult.bollinger.lower} 元</div>
              </div>
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-xs text-orange-600">壓力位</div>
                <div className="font-mono font-bold text-red-600">{displayResult.resistance ?? displayResult.bollinger.upper} 元</div>
              </div>
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-xs text-orange-600">ATR (14)</div>
                <div className="font-mono font-bold text-orange-700">{displayResult.atr ?? "-"} 元</div>
              </div>
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-xs text-orange-600">VWAP</div>
                <div className="font-mono font-bold text-orange-700">{displayResult.vwap ?? "-"} 元</div>
              </div>
            </div>
            <p className="text-xs text-orange-600">
              {displayResult.support && displayResult.resistance
                ? `操作空間：${displayResult.resistance - displayResult.support} 元 (${((displayResult.resistance / displayResult.support - 1) * 100).toFixed(1)}%)`
                : "布林帶中軌 ({displayResult.bollinger.middle}) 為短期停損參考"}
            </p>
          </div>
        </div>
    
        {/* 量價背離 */}
        {(displayResult.divergence && displayResult.divergence !== "無") && (
          <div className="p-4 bg-gradient-to-br from-rose-50 to-rose-100 border border-rose-200 rounded-xl mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-rose-800">⚠️ 量價背離警示</span>
            </div>
            <p className="text-sm text-rose-700">{displayResult.divergence}</p>
            <p className="text-xs text-rose-600 mt-1">
              量價背離通常預示趨勢可能反轉，建議提高警覺，密切觀察後續量價變化。
            </p>
          </div>
        )}
    
        {/* 綜合建議 */}
        <div className="p-5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-6 h-6 text-green-400" />
            <span className="text-lg font-bold">綜合操作建議</span>
            <span className={`ml-auto px-3 py-1 rounded-full text-sm font-bold ${
              displayResult.signal === "買入"
                ? "bg-green-500/20 text-green-400"
                : displayResult.signal === "賣出"
                ? "bg-red-500/20 text-red-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}>
              {displayResult.signal}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">評分解讀</div>
              <p className="text-sm text-gray-200">
                {displayResult.score >= 75
                  ? "多項指標強烈共振看多，建議積極操作。"
                  : displayResult.score >= 65
                  ? "多項指標共振看多，建議持有或適度加碼。"
                  : displayResult.score <= 25
                  ? "多項指標強烈看空，建議空倉避險。"
                  : displayResult.score <= 35
                  ? "多項指標看空，建議減倉或停損。"
                  : "指標Mixed，建議觀望為主，等待明確訊號。"}
              </p>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">停損參考</div>
              <p className="text-sm text-gray-200">
                {displayResult.atr
                  ? `ATR 停損：現價 - 2×ATR = ${(klineData[klineData.length - 1]?.close - 2 * displayResult.atr).toFixed(0)} 元`
                  : `布林帶中軌 (${displayResult.bollinger.middle} 元) 附近`}
              </p>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">目標價位</div>
              <p className="text-sm text-gray-200">
                {displayResult.resistance
                  ? `短期壓力：${displayResult.resistance} 元`
                  : `布林帶上軌 (${displayResult.bollinger.upper} 元)`}
              </p>
            </div>
          </div>
        </div>
      </div>
    
      {/* 詳細指標數值 - 精簡版 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">詳細指標數值</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">K 值</div>
            <div className="font-mono font-bold text-blue-600">{displayResult.kdj.k.toFixed(1)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">D 值</div>
            <div className="font-mono font-bold text-orange-600">{displayResult.kdj.d.toFixed(1)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">J 值</div>
            <div className="font-mono font-bold text-pink-600">{displayResult.kdj.j.toFixed(1)}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">布林上軌</div>
            <div className="font-mono font-bold text-red-600">{displayResult.bollinger.upper}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">布林中軌</div>
            <div className="font-mono font-bold">{displayResult.bollinger.middle}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">布林下軌</div>
            <div className="font-mono font-bold text-green-600">{displayResult.bollinger.lower}</div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

export default function TechnicalPage() {
  return <Suspense fallback={<div className="p-8 text-gray-400">載入中...</div>}><TechnicalPageContent /></Suspense>;
}
