"use client";

import { Search, TrendingUp, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import {
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
}

/** 根據股票代碼生成模擬 K 線數據（作為 API 無數據時的 fallback） */
function generateMockKlineData(code: string): KLineData[] {
  const basePrice = code === "2330" ? 580 : code === "2317" ? 320 : 150;
  const data: KLineData[] = [];
  let price = basePrice;
  const now = new Date();

  for (let i = 60; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.48) * price * 0.03;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * price * 0.01;
    const low = Math.min(open, close) - Math.random() * price * 0.01;
    const volume = Math.floor(50000 + Math.random() * 150000);

    data.push({
      date: date.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return data;
}

export default function TechnicalPage() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [searchCode, setSearchCode] = useState(codeFromUrl || "2330");
  const [selectedCode, setSelectedCode] = useState(codeFromUrl || "2330");
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalResult, setTechnicalResult] = useState<TechnicalResult | null>(null);
  const [interval, setInterval] = useState<"1d" | "1w" | "1mo">("1d");

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
      try {
        let apiSuccess = false;

        // 獲取 K 線數據
        try {
          const klineRes = await api.get(`/api/stocks/${selectedCode}/kline?interval=${interval}`);
          const rawData = klineRes.data?.data || [];

          if (rawData.length > 0) {
            const formatted: KLineData[] = rawData.map((item: any) => ({
              date: new Date(item.date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
              open: item.open ?? 0,
              high: item.high ?? 0,
              low: item.low ?? 0,
              close: item.close ?? 0,
              volume: item.volume ?? 0,
            }));

            setKlineData(formatted);
            apiSuccess = true;
          }
        } catch {
          // K 線 API 失敗
        }

        // 如果 K 線 API 無數據，使用模擬數據
        if (!apiSuccess) {
          const mockData = generateMockKlineData(selectedCode);
          setKlineData(mockData);
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

    // 限制標註數量 (最多 6 個)
    return result.slice(0, 6);
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

    // 布林帶計算
    const ma20 = closes.slice(-20);
    const middle = ma20.length ? ma20.reduce((a, b) => a + b, 0) / ma20.length : closes[closes.length - 1];
    const stdDev = ma20.length ? Math.sqrt(ma20.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / ma20.length) : 0;

    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const currentVol = volumes[volumes.length - 1] ?? 0;

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
        upper: Math.round(middle + 2 * stdDev),
        middle: Math.round(middle),
        lower: Math.round(middle - 2 * stdDev),
      },
      volume: {
        avg_volume: Math.round(avgVol),
        current_volume: Math.round(currentVol),
        ratio: avgVol > 0 ? currentVol / avgVol : 1,
      },
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
      <div className="flex items-center justify-between mb-6">
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
                <h2 className="text-lg font-bold text-gray-900">{selectedCode} - 技術面分析</h2>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">K 線圖 + 移動平均線 + 技術標註 ({klineData.length} 根 K 線)</h3>
            {/* 日/週/月 切換 */}
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
            <LineChart data={macdData}>
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 詳細指標數值 + K 線決策分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 詳細指標數值 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">詳細指標數值</h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                KDJ 指標
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-blue-50 rounded text-center">
                  <div className="text-xs text-gray-500">K 值</div>
                  <div className="font-mono font-medium text-blue-600">{displayResult.kdj.k.toFixed(1)}</div>
                </div>
                <div className="p-2 bg-yellow-50 rounded text-center">
                  <div className="text-xs text-gray-500">D 值</div>
                  <div className="font-mono font-medium text-yellow-600">{displayResult.kdj.d.toFixed(1)}</div>
                </div>
                <div className="p-2 bg-pink-50 rounded text-center">
                  <div className="text-xs text-gray-500">J 值</div>
                  <div className="font-mono font-medium text-pink-600">{displayResult.kdj.j.toFixed(1)}</div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                布林帶 (BOLL)
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-red-50 rounded text-center">
                  <div className="text-xs text-gray-500">上軌</div>
                  <div className="font-mono font-medium text-red-600">{displayResult.bollinger.upper}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-xs text-gray-500">中軌</div>
                  <div className="font-mono font-medium">{displayResult.bollinger.middle}</div>
                </div>
                <div className="p-2 bg-green-50 rounded text-center">
                  <div className="text-xs text-gray-500">下軌</div>
                  <div className="font-mono font-medium text-green-600">{displayResult.bollinger.lower}</div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                量價分析
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-xs text-gray-500">均量</div>
                  <div className="font-mono font-medium">{(displayResult.volume.avg_volume / 1000).toFixed(0)}K</div>
                </div>
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-xs text-gray-500">現量</div>
                  <div className="font-mono font-medium">{(displayResult.volume.current_volume / 1000).toFixed(0)}K</div>
                </div>
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="text-xs text-gray-500">量比</div>
                  <div className="font-mono font-medium">{displayResult.volume.ratio.toFixed(2)}x</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* K 線決策分析 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">K 線決策分析</h3>
          <div className="space-y-3">
            {/* MA 排列分析 */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700">MA {displayResult.ma_alignment}</span>
              </div>
              <p className="text-xs text-green-600">
                {displayResult.ma_alignment === "多頭排列" ? "MA5 > MA10 > MA20，呈現標準多頭排列，短期趨勢向上。" : displayResult.ma_alignment === "空頭排列" ? "MA5 < MA10 < MA20，呈現空頭排列，短期趨勢向下。" : "均線交錯，趨勢不明朗，建議觀望。"}
              </p>
            </div>

            {/* RSI 分析 */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-blue-700">RSI 強弱區間</span>
              </div>
              <p className="text-xs text-blue-600">
                RSI = {displayResult.rsi.toFixed(1)}，{displayResult.rsi > 70 ? "已進入超買區，留意回調風險。" : displayResult.rsi < 30 ? "已進入超賣區，可能有反彈機會。" : "處於中性區間，趨勢穩定。"}
              </p>
            </div>

            {/* MACD 分析 */}
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-purple-700">MACD 訊號</span>
              </div>
              <p className="text-xs text-purple-600">
                MACD 線 ({displayResult.macd.macd_line.toFixed(2)}) {displayResult.macd.macd_line > displayResult.macd.signal_line ? "在" : "在"} Signal 線 ({displayResult.macd.signal_line.toFixed(2)}) {displayResult.macd.macd_line > displayResult.macd.signal_line ? "之上" : "之下"}，柱狀圖為{displayResult.macd.histogram >= 0 ? "正" : "負"} ({displayResult.macd.histogram.toFixed(2)})，{displayResult.macd.histogram >= 0 ? "多頭" : "空頭"}動能{displayResult.macd.histogram >= 0 ? "持續" : "增強"}。
              </p>
            </div>

            {/* KDJ 分析 */}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-yellow-700">KDJ 交叉訊號</span>
              </div>
              <p className="text-xs text-yellow-600">
                {`K(${displayResult.kdj.k.toFixed(1)}) ${displayResult.kdj.k > displayResult.kdj.d ? ">" : "<"} D(${displayResult.kdj.d.toFixed(1)})，${displayResult.kdj.k > displayResult.kdj.d ? "K 線上穿 D 線，短線偏多。" : "K 線下穿 D 線，短線偏空。"}J 值 (${displayResult.kdj.j.toFixed(1)})${displayResult.kdj.j > 80 ? "已超買" : displayResult.kdj.j < 20 ? "已超賣" : "處於正常區間"}。`}
              </p>
            </div>

            {/* 綜合建議 */}
            <div className="p-3 bg-gray-900 text-white rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold">綜合建議：{displayResult.signal}</span>
              </div>
              <p className="text-xs text-gray-300">
                {displayResult.score >= 65 ? "多項指標共振看多，建議持有或適度加碼。" : displayResult.score <= 35 ? "多項指標看空，建議減倉或停損。" : "指標Mixed，建議觀望為主。"}停損參考：布林帶中軌 ({displayResult.bollinger.middle}) 附近。
              </p>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
