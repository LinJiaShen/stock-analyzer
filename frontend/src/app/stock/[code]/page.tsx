"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Loader2, BarChart3, Activity, Brain, LineChart, Radio, Star } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CandlestickChart, { type TechnicalAnnotation } from "@/components/technical/CandlestickChart";
import KLineIntervalSelector from "@/components/technical/KLineIntervalSelector";
import ScoreBreakdownCard, { type ScoreExplanations } from "@/components/decision/ScoreBreakdownCard";
import RadarChartComponent from "@/components/decision/RadarChartComponent";
import OperationGuideCard from "@/components/decision/OperationGuideCard";
import FundamentalCard from "@/components/decision/FundamentalCard";
import AIAnalysisCard from "@/components/decision/AIAnalysisCard";
import api from "@/lib/api";
import { useStockWebSocket, type WebSocketMessage } from "@/hooks/useStockWebSocket";
import { useIsMarketOpen } from "@/hooks/useIsMarketOpen";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type TabId = "technical" | "chip" | "sentiment" | "decision";

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: "technical", label: "技術分析", icon: LineChart },
  { id: "chip", label: "籌碼分析", icon: BarChart3 },
  { id: "sentiment", label: "情緒分析", icon: Activity },
  { id: "decision", label: "決策評分", icon: Brain },
];

const FALLBACK_RADAR = { value: 0, momentum: 0, chip: 0, growth: 0, resistance: 0 };

// K 線形態說明（對應後端 pattern.py 的 PATTERN_NAMES）
const PATTERN_DESCRIPTIONS: Record<string, string> = {
  "大紅K": "開盤即漲、收在最高附近，買方力道強勁，多頭續攻訊號",
  "大黑K": "開盤即跌、收在最低附近，賣壓沉重，空頭續跌訊號",
  "倒鎚線": "下跌後出現長上影線，買方嘗試反攻，低檔出現可能反轉向上",
  "墓碑線": "長上影線收最低，上攻失敗賣壓重，高檔出現易反轉向下",
  "鎚子線": "長下影線收高，下殺被買盤承接，低檔出現是止跌訊號",
  "吊人線": "高檔出現長下影線，多頭力竭警訊，留意趨勢反轉",
  "紡錘線": "實體小上下影線長，多空拉鋸方向不明，等待表態",
  "十字線": "開收盤幾乎同價，多空平衡，常為趨勢轉折的前兆",
  "一字線": "四價同價（多為漲跌停鎖死），極端單邊力道",
  "多頭吞噬": "紅K完全包覆前一根黑K，買方反轉吃掉賣方，強烈看漲",
  "空頭吞噬": "黑K完全包覆前一根紅K，賣方反轉吃掉買方，強烈看跌",
  "晨星": "下跌→十字觀望→大漲的三根組合，經典底部反轉訊號",
  "夜星": "上漲→十字觀望→大跌的三根組合，經典頭部反轉訊號",
  "多頭孤島反轉": "跳空下跌後跳空上漲形成孤島，底部強力反轉",
  "空頭孤島反轉": "跳空上漲後跳空下跌形成孤島，頭部強力反轉",
};

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [activeTab, setActiveTab] = useState<TabId>("technical");
  const [interval, setInterval] = useState("1d");
  const [loading, setLoading] = useState(true);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [annotations, setAnnotations] = useState<TechnicalAnnotation[]>([]);
  const [stockName, setStockName] = useState("");
  const [scoreData, setScoreData] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [chipData, setChipData] = useState<any[]>([]);
  const [chipAnalysis, setChipAnalysis] = useState<any>(null);
  const [techDetail, setTechDetail] = useState<any>(null);
  const [sentimentData, setSentimentData] = useState<any>(null);
  const [realtimePrice, setRealtimePrice] = useState<number | null>(null);
  const isMarketOpen = useIsMarketOpen();

  const wsChartInterval = interval === "5m" ? "5m" : interval === "1d" ? "daily" : null;

  const handleWsMessage = useCallback((message: WebSocketMessage) => {
    if (message.type !== "candle_update" || !message.data) return;
    const candle = message.data;
    setRealtimePrice(candle.close);
    if (message.interval === wsChartInterval) {
      const candleDate = new Date(candle.open_time)
        .toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })
        .replace(/\//g, "/");
      setKlineData((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updatedBar = {
          date: candleDate,
          open: last.date === candleDate ? last.open : candle.open,
          high: last.date === candleDate ? Math.max(last.high, candle.high) : candle.high,
          low: last.date === candleDate ? Math.min(last.low, candle.low) : candle.low,
          close: candle.close,
          volume: candle.volume,
        };
        if (last.date === candleDate) {
          return [...prev.slice(0, -1), updatedBar];
        }
        return [...prev, updatedBar];
      });
    }
  }, [wsChartInterval]);

  const { connected, marketOpen } = useStockWebSocket({
    stockCode: code,
    interval: "all",
    enabled: isMarketOpen,
    onMessage: handleWsMessage,
  });

  useEffect(() => { setRealtimePrice(null); }, [code]);

  // 股票基本資訊
  useEffect(() => {
    api.get(`/api/stocks/${code}`)
      .then((res) => setStockName(res.data?.name || code))
      .catch(() => setStockName(code));
  }, [code]);

  // K 線數據
  useEffect(() => {
    setLoading(true);
    api.get(`/api/stocks/${code}/kline`, { params: { interval, limit: 300 }, timeout: 15000 })
      .then((res) => {
        const rawData = res.data?.data || [];
        setKlineData(rawData.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
          open: item.open ?? 0,
          high: item.high ?? 0,
          low: item.low ?? 0,
          close: item.close ?? 0,
          volume: item.volume ?? 0,
        })));
      })
      .catch(() => setKlineData([]))
      .finally(() => setLoading(false));
  }, [code, interval]);

  // 決策評分
  useEffect(() => {
    api.get(`/api/decision/score/${code}`, { timeout: 20000 })
      .then((res) => setScoreData(res.data))
      .catch(() => setScoreData({}));
  }, [code]);

  // 雷達圖
  useEffect(() => {
    api.get(`/api/decision/radar/${code}`, { timeout: 20000 })
      .then((res) => setRadarData(res.data))
      .catch(() => setRadarData({}));
  }, [code]);

  // 決策訊號（含 operation 操作建議）
  useEffect(() => {
    api.get(`/api/decision/signals`, { params: { stock_code: code } })
      .then((res) => setSignals(res.data?.signals || []))
      .catch(() => setSignals([]));
  }, [code]);

  // 籌碼原始數據
  useEffect(() => {
    api.get(`/api/stocks/${code}/chip`, { params: { days: 30 } })
      .then((res) => setChipData(res.data?.data || res.data || []))
      .catch(() => setChipData([]));
  }, [code]);

  // 籌碼分析（用於評分說明）
  useEffect(() => {
    api.get(`/api/analysis/chip/${code}`, { params: { days: 30 }, timeout: 20000 })
      .then((res) => setChipAnalysis(res.data))
      .catch(() => setChipAnalysis(null));
  }, [code]);

  // 技術分析（用於支撐/壓力標注和評分說明）
  useEffect(() => {
    api.get(`/api/analysis/technical/${code}`, { params: { period: "medium", interval }, timeout: 20000 })
      .then((res) => setTechDetail(res.data))
      .catch(() => setTechDetail(null));
  }, [code, interval]);

  // 情緒數據
  useEffect(() => {
    api.get(`/api/analysis/sentiment/${code}`)
      .then((res) => setSentimentData(res.data))
      .catch(() => setSentimentData(null));
  }, [code]);

  // 美股關聯（ADR + 產業指數，昨夜收盤）
  const [usRelated, setUsRelated] = useState<any>(null);
  useEffect(() => {
    api.get(`/api/stocks/us-related/${code}`, { timeout: 30000 })
      .then((res) => setUsRelated(res.data))
      .catch(() => setUsRelated(null));
  }, [code]);

  // 當 techDetail 或 klineData 更新時，設定支撐/壓力標注
  useEffect(() => {
    const support = scoreData?.support ?? techDetail?.support ?? null;
    const resistance = scoreData?.resistance ?? techDetail?.resistance ?? null;
    if ((!support && !resistance) || klineData.length === 0) {
      setAnnotations([]);
      return;
    }
    const lastDate = klineData[klineData.length - 1]?.date ?? "";
    const ann: TechnicalAnnotation[] = [];
    if (support) {
      ann.push({
        type: "support",
        price: support,
        label: `支撐 ${support}`,
        date: lastDate,
        position: "bottom",
        detail: "近期低點支撐位",
        pattern: "",
      });
    }
    if (resistance) {
      ann.push({
        type: "resistance",
        price: resistance,
        label: `壓力 ${resistance}`,
        date: lastDate,
        position: "top",
        detail: "近期高點壓力位",
        pattern: "",
      });
    }
    setAnnotations(ann);
  }, [scoreData, techDetail, klineData]);

  const currentPrice = useMemo(() => {
    if (realtimePrice !== null) return realtimePrice;
    if (klineData.length === 0) return null;
    return klineData[klineData.length - 1].close;
  }, [klineData, realtimePrice]);

  const priceChange = useMemo(() => {
    if (klineData.length < 2) return { value: 0, percent: 0 };
    const prev = klineData[klineData.length - 2].close;
    const curr = klineData[klineData.length - 1].close;
    return { value: curr - prev, percent: ((curr - prev) / prev) * 100 };
  }, [klineData]);

  // 52 週高低（klineData 包含 300 根，約 15 個月）
  const week52 = useMemo(() => {
    if (klineData.length === 0) return null;
    const recent = klineData.slice(-252); // 約 52 週交易日
    const high = Math.max(...recent.map((d) => d.high));
    const low = Math.min(...recent.map((d) => d.low));
    return { high, low };
  }, [klineData]);

  // 評分維度說明文字
  const scoreExplanations: ScoreExplanations | undefined = useMemo(() => {
    if (!techDetail && !chipAnalysis) return undefined;
    const parts: ScoreExplanations = {};
    if (techDetail) {
      const rsiText =
        techDetail.rsi > 70 ? `RSI=${techDetail.rsi.toFixed(0)} 超買` :
        techDetail.rsi < 30 ? `RSI=${techDetail.rsi.toFixed(0)} 超賣` :
        `RSI=${techDetail.rsi.toFixed(0)}`;
      const macdText = (techDetail.macd?.histogram ?? 0) > 0 ? "MACD 多頭" : "MACD 空頭";
      const maText = techDetail.ma_alignment?.includes("多頭") ? "均線多排" :
                     techDetail.ma_alignment?.includes("空頭") ? "均線空排" : "";
      parts.technical = [rsiText, macdText, maText].filter(Boolean).join(" · ");
    }
    if (chipAnalysis) {
      const foreignDays = chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0;
      const marginTrend = chipAnalysis.margin_trading?.margin_trend;
      const chipParts = [
        foreignDays > 0 ? `外資連買 ${foreignDays} 天` : foreignDays < 0 ? `外資連賣 ${Math.abs(foreignDays)} 天` : "",
        marginTrend === "increasing" ? "融資增加" : marginTrend === "decreasing" ? "融資減少" : "",
      ].filter(Boolean);
      if (chipParts.length > 0) parts.chip = chipParts.join(" · ");
    }
    if (sentimentData?.score != null) {
      const newsCount = sentimentData.news_sentiment?.news_count ?? 0;
      parts.sentiment = `情緒分 ${sentimentData.score}，共 ${newsCount} 則新聞`;
    }
    return Object.keys(parts).length > 0 ? parts : undefined;
  }, [techDetail, chipAnalysis, sentimentData]);

  const isUp = priceChange.value >= 0;
  const signal = signals[0];

  // 追蹤清單
  const queryClient = useQueryClient();
  const { data: watchlistItems = [] } = useQuery<Array<{ id: string; stock_code: string }>>({
    queryKey: ["watchlist"],
    queryFn: async () => {
      const res = await api.get("/api/watchlist/");
      return res.data;
    },
    retry: false,
  });
  const watchlistItem = watchlistItems.find((w) => w.stock_code === code);
  const isWatched = !!watchlistItem;

  const watchlistMutation = useMutation({
    mutationFn: async () => {
      if (isWatched && watchlistItem) {
        await api.delete(`/api/watchlist/${watchlistItem.id}`);
      } else {
        await api.post("/api/watchlist/", { stock_code: code });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">{stockName || code}</h1>
                  {connected && marketOpen && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <Radio className="w-3 h-3 animate-pulse" />
                      即時
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-bold font-mono">{currentPrice?.toFixed(2) || "--"}</span>
                  {priceChange.value !== 0 && (
                    <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-red-600" : "text-green-600"}`}>
                      {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {isUp ? "+" : ""}{priceChange.value.toFixed(2)} ({isUp ? "+" : ""}{priceChange.percent.toFixed(2)}%)
                    </span>
                  )}
                  {/* 52 週高低 */}
                  {week52 && currentPrice != null && (
                    <div className="flex items-center gap-2 ml-2 text-xs text-gray-500">
                      <span>52W</span>
                      <span className="text-green-600">{week52.low.toFixed(1)}</span>
                      <div className="relative w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-blue-400 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, ((currentPrice - week52.low) / (week52.high - week52.low)) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="text-red-500">{week52.high.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Watchlist + Score */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => watchlistMutation.mutate()}
                disabled={watchlistMutation.isPending}
                title={isWatched ? "從追蹤清單移除" : "加入追蹤清單"}
                className={`p-2 rounded-lg transition-colors ${
                  isWatched
                    ? "text-yellow-500 bg-yellow-50 hover:bg-yellow-100"
                    : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-50"
                }`}
              >
                <Star className={`w-5 h-5 ${isWatched ? "fill-yellow-500" : ""}`} />
              </button>

              {/* Score Badge（台股慣例：紅=偏多、綠=偏空、灰=中性） */}
              {scoreData?.total_score != null && (
                <div className={`px-4 py-2 rounded-xl ${
                  scoreData.total_score >= 60 ? "bg-red-50 text-red-700" :
                  scoreData.total_score >= 40 ? "bg-gray-100 text-gray-600" :
                  "bg-green-50 text-green-700"
                }`}>
                  <div className="text-xs font-medium">
                    綜合評分
                    <span className="ml-1 opacity-70">
                      {scoreData.total_score >= 60 ? "偏多" : scoreData.total_score >= 40 ? "中性" : "偏空"}
                    </span>
                  </div>
                  <div className="text-2xl font-bold">{scoreData.total_score}</div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 -mb-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-white text-gray-900 border-t-2 border-x border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "technical" && (
          <div className="space-y-6">
            {/* 美股關聯（隔夜 ADR / 產業指數表現） */}
            {usRelated?.related?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">美股關聯（最近收盤）</h3>
                  <span className="text-[10px] text-gray-400">
                    美股收盤時為台灣時間昨夜資料，反映隔夜情緒
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {usRelated.related.map((r: any, i: number) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-gray-500">{r.name}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded ${
                          r.relation === "ADR" ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
                        }`}>{r.relation}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold font-mono text-gray-900">
                          {r.price?.toLocaleString()}
                        </span>
                        <span className={`text-xs font-mono font-medium ${
                          r.change_percent > 0 ? "text-red-600" : r.change_percent < 0 ? "text-green-600" : "text-gray-500"
                        }`}>
                          {r.change_percent > 0 ? "+" : ""}{r.change_percent}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">K 線圖</h2>
                  <KLineIntervalSelector selected={interval} onChange={setInterval} disabled={loading} />
                </div>
                <CandlestickChart data={klineData} annotations={annotations} height={450} />
              </div>
            )}

            {/* 技術指標摘要（含白話注解） */}
            {techDetail && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">技術指標</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">RSI（相對強弱）</div>
                    <div className={`text-lg font-bold font-mono ${
                      techDetail.rsi > 70 ? "text-red-600" : techDetail.rsi < 30 ? "text-green-600" : "text-gray-900"
                    }`}>
                      {techDetail.rsi?.toFixed(1) ?? "--"}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      {techDetail.rsi > 70 ? "超過 70：買盤過熱，追高風險大" :
                       techDetail.rsi < 30 ? "低於 30：賣壓過重，留意止跌反彈" :
                       "30–70 之間屬正常區間"}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">MACD 柱</div>
                    <div className={`text-lg font-bold font-mono ${
                      (techDetail.macd?.histogram ?? 0) > 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {techDetail.macd?.histogram?.toFixed(3) ?? "--"}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      {(techDetail.macd?.histogram ?? 0) > 0
                        ? "紅柱：短期動能向上（多方）"
                        : "綠柱：短期動能向下（空方）"}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">KDJ (K)</div>
                    <div className="text-lg font-bold font-mono text-gray-900">
                      {techDetail.kdj?.k?.toFixed(1) ?? "--"}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      {(techDetail.kdj?.k ?? 50) > 80 ? "高檔鈍化：短線過熱" :
                       (techDetail.kdj?.k ?? 50) < 20 ? "低檔：短線超賣" :
                       "短線指標，敏感度高於 RSI"}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">均線排列</div>
                    <div className="text-sm font-semibold text-gray-700">
                      {techDetail.ma_alignment ?? "--"}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                      多頭排列＝短中長期均線由上往下排，趨勢向上；空頭排列反之
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "chip" && (
          <div className="space-y-6">
            {/* 摘要統計卡片 */}
            {chipAnalysis && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">籌碼摘要</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* 外資連買/賣 */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">外資連買/賣</div>
                    <div className={`text-2xl font-bold font-mono ${
                      (chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0) > 0 ? "text-red-600" :
                      (chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0) < 0 ? "text-green-600" : "text-gray-500"
                    }`}>
                      {(chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0) > 0 ? "+" : ""}
                      {chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0} 天
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0) > 0 ? "連續買超" :
                       (chipAnalysis.dealer_flow?.foreign_consecutive_days ?? 0) < 0 ? "連續賣超" : "中性"}
                    </div>
                  </div>
                  {/* 投信連買/賣 */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">投信連買/賣</div>
                    <div className={`text-2xl font-bold font-mono ${
                      (chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0) > 0 ? "text-red-600" :
                      (chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0) < 0 ? "text-green-600" : "text-gray-500"
                    }`}>
                      {(chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0) > 0 ? "+" : ""}
                      {chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0} 天
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0) > 0 ? "連續買超" :
                       (chipAnalysis.dealer_flow?.invest_trust_consecutive_days ?? 0) < 0 ? "連續賣超" : "中性"}
                    </div>
                  </div>
                  {/* 30日外資累計 */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">30日外資累計</div>
                    <div className={`text-2xl font-bold font-mono ${
                      (chipAnalysis.dealer_flow?.foreign_net_buy ?? 0) >= 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {chipAnalysis.dealer_flow?.foreign_net_buy != null
                        ? `${(chipAnalysis.dealer_flow.foreign_net_buy / 1000).toFixed(1)}K`
                        : "--"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">張</div>
                  </div>
                  {/* 融資狀況 */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">融資趨勢</div>
                    <div className={`text-2xl font-bold font-mono ${
                      chipAnalysis.margin_trading?.margin_trend === "increasing" ? "text-red-600" :
                      chipAnalysis.margin_trading?.margin_trend === "decreasing" ? "text-green-600" : "text-gray-500"
                    }`}>
                      {chipAnalysis.margin_trading?.margin_trend === "increasing" ? "增加↑" :
                       chipAnalysis.margin_trading?.margin_trend === "decreasing" ? "減少↓" : "持平"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {chipAnalysis.margin_trading?.margin_balance != null
                        ? `餘額 ${chipAnalysis.margin_trading.margin_balance.toLocaleString()} 張`
                        : ""}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 三大法人買賣超趨勢圖 */}
            {chipData.length > 0 && (() => {
              const sorted = [...chipData].sort((a, b) => a.date < b.date ? -1 : 1).slice(-20);
              const shortDate = (d: string) => d.replace(/^\d{4}-/, "").replace("-", "/");
              return (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">三大法人買賣超（近20日，張）</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={sorted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                      <Tooltip
                        formatter={(val: any, name: any) => [val?.toLocaleString() + " 張", name]}
                        labelFormatter={(l) => `日期：${l}`}
                      />
                      <Legend />
                      <ReferenceLine y={0} stroke="#d1d5db" />
                      <Bar dataKey="foreign_net" name="外資" fill="#ef4444" opacity={0.85} radius={[2,2,0,0]}
                        label={false}
                        /* 負值用綠色 */
                        isAnimationActive={false}
                      />
                      <Bar dataKey="trust_net" name="投信" fill="#f97316" opacity={0.85} radius={[2,2,0,0]} isAnimationActive={false} />
                      <Bar dataKey="proprietary_net" name="自營商" fill="#8b5cf6" opacity={0.7} radius={[2,2,0,0]} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* 融資餘額趨勢圖 */}
            {chipData.length > 0 && chipData.some((r: any) => r.margin_balance != null) && (() => {
              const sorted = [...chipData]
                .filter((r: any) => r.margin_balance != null)
                .sort((a, b) => a.date < b.date ? -1 : 1)
                .slice(-20);
              const shortDate = (d: string) => d.replace(/^\d{4}-/, "").replace("-", "/");
              const minVal = Math.min(...sorted.map((r: any) => r.margin_balance ?? 0));
              const maxVal = Math.max(...sorted.map((r: any) => r.margin_balance ?? 0));
              const padding = (maxVal - minVal) * 0.1 || 100;
              return (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">融資餘額趨勢（近20日，張）</h3>
                  <p className="text-xs text-gray-400 mb-4">融資餘額增加 = 散戶槓桿增加（需注意籌碼穩定度）</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={sorted} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis domain={[minVal - padding, maxVal + padding]} tick={{ fontSize: 11 }}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                      <Tooltip
                        formatter={(val: any) => [val?.toLocaleString() + " 張", "融資餘額"]}
                        labelFormatter={(l) => `日期：${l}`}
                      />
                      <Line dataKey="margin_balance" name="融資餘額" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* 原始數據表（完整20筆） */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">近期明細（張）</h3>
              {chipData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500">
                        <th className="py-2 px-3 text-left">日期</th>
                        <th className="py-2 px-3 text-right">外資</th>
                        <th className="py-2 px-3 text-right">投信</th>
                        <th className="py-2 px-3 text-right">自營商</th>
                        <th className="py-2 px-3 text-right">三大合計</th>
                        <th className="py-2 px-3 text-right">融資餘額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...chipData].sort((a: any, b: any) => a.date < b.date ? 1 : -1).slice(0, 20).map((row: any, i: number) => {
                        const total = (row.foreign_net ?? 0) + (row.trust_net ?? 0) + (row.proprietary_net ?? 0);
                        return (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3 text-gray-700">{row.date}</td>
                            <td className={`py-2 px-3 text-right font-mono text-xs ${(row.foreign_net ?? 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
                              {row.foreign_net != null ? (row.foreign_net >= 0 ? "+" : "") + row.foreign_net.toLocaleString() : "--"}
                            </td>
                            <td className={`py-2 px-3 text-right font-mono text-xs ${(row.trust_net ?? 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
                              {row.trust_net != null ? (row.trust_net >= 0 ? "+" : "") + row.trust_net.toLocaleString() : "--"}
                            </td>
                            <td className={`py-2 px-3 text-right font-mono text-xs ${(row.proprietary_net ?? 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
                              {row.proprietary_net != null ? (row.proprietary_net >= 0 ? "+" : "") + row.proprietary_net.toLocaleString() : "--"}
                            </td>
                            <td className={`py-2 px-3 text-right font-mono text-xs font-semibold ${total >= 0 ? "text-red-700" : "text-green-700"}`}>
                              {(total >= 0 ? "+" : "") + total.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-xs text-gray-600">
                              {row.margin_balance != null ? row.margin_balance.toLocaleString() : "--"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">暫無籌碼數據</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "sentiment" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">情緒分析</h2>
            {sentimentData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-xl">
                    <div className="text-sm text-green-600">正面新聞</div>
                    <div className="text-2xl font-bold text-green-700">
                      {sentimentData.news_sentiment?.positive_ratio != null
                        ? `${(sentimentData.news_sentiment.positive_ratio * 100).toFixed(0)}%`
                        : "--"}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <div className="text-sm text-gray-600">中性新聞</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {sentimentData.news_sentiment?.neutral_ratio != null
                        ? `${(sentimentData.news_sentiment.neutral_ratio * 100).toFixed(0)}%`
                        : "--"}
                    </div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl">
                    <div className="text-sm text-red-600">負面新聞</div>
                    <div className="text-2xl font-bold text-red-700">
                      {sentimentData.news_sentiment?.negative_ratio != null
                        ? `${(sentimentData.news_sentiment.negative_ratio * 100).toFixed(0)}%`
                        : "--"}
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl">
                  <div className="text-sm text-blue-600 mb-2">情緒評分</div>
                  <div className="text-3xl font-bold text-blue-700">{sentimentData.score ?? "--"}/100</div>
                </div>
                {sentimentData.news_sentiment?.keywords?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">熱門關鍵詞</div>
                    <div className="flex flex-wrap gap-2">
                      {sentimentData.news_sentiment.keywords.map((kw: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 近期新聞（含個別情緒評分） */}
                {sentimentData.news?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      近期新聞（{sentimentData.news.length} 則）
                    </div>
                    <div className="space-y-2">
                      {sentimentData.news.map((n: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                            n.sentiment_score > 0.1 ? "bg-green-100 text-green-700" :
                            n.sentiment_score < -0.1 ? "bg-red-100 text-red-700" :
                            "bg-gray-200 text-gray-600"
                          }`}>
                            {n.sentiment_score > 0 ? "+" : ""}{n.sentiment_score.toFixed(1)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-900">{n.title}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {n.source}
                              {n.time && ` · ${new Date(n.time).toLocaleDateString("zh-TW")}`}
                              {n.summary && <span className="text-purple-500"> · {n.summary}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 分析方法說明 */}
                {sentimentData.method && (
                  <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
                    分析方法：{sentimentData.method}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">暫無情緒數據</div>
            )}
          </div>
        )}

        {activeTab === "decision" && (
          <div className="space-y-6">
            {/* 評分卡片（含維度說明） */}
            <ScoreBreakdownCard
              scores={{
                technical: scoreData?.technical_score ?? 0,
                chip: scoreData?.chip_score ?? 0,
                fundamental: scoreData?.fundamental_score ?? 0,
                sentiment: scoreData?.sentiment_score ?? 0,
              }}
              totalScore={scoreData?.total_score ?? 0}
              loading={scoreData === null}
              explanations={scoreExplanations}
            />

            {/* 操作建議（來自評分資料，不依賴訊號） */}
            <OperationGuideCard
              data={scoreData?.operation ?? signal?.operation ?? null}
              confidence={scoreData?.confidence ?? null}
              loading={scoreData === null}
            />

            {/* 基本面快照（估值與獲利能力） */}
            <FundamentalCard stockCode={code} />

            {/* AI 分析（為什麼這個分數、注意什麼） */}
            <AIAnalysisCard stockCode={code} />

            {/* 雷達圖 */}
            <RadarChartComponent
              data={radarData?.radar ?? FALLBACK_RADAR}
              stockCode={code}
              loading={radarData === null}
            />

            {/* K 線形態 */}
            {scoreData?.recent_patterns && scoreData.recent_patterns.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">近期 K 線形態</h3>
                <div className="space-y-2">
                  {scoreData.recent_patterns.map((p: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                        p.score > 0 ? "bg-green-500" : p.score < 0 ? "bg-red-500" : "bg-gray-400"
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{p.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            p.score > 0 ? "bg-green-100 text-green-700" : p.score < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {p.score > 0 ? "偏多" : p.score < 0 ? "偏空" : "中性"}
                          </span>
                          <span className="text-xs text-gray-400">{p.date}</span>
                        </div>
                        {PATTERN_DESCRIPTIONS[p.name] && (
                          <p className="text-xs text-gray-500 mt-1">{PATTERN_DESCRIPTIONS[p.name]}</p>
                        )}
                      </div>
                      <span className={`text-sm font-mono ${
                        p.score > 0 ? "text-green-600" : p.score < 0 ? "text-red-600" : "text-gray-500"
                      }`}>
                        {p.score > 0 ? "+" : ""}{p.score}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-400 mt-2">
                    分數為形態強度（正=看漲、負=看跌），來自最近 10 根 K 線的形態偵測，僅供參考不構成投資建議。
                  </p>
                </div>
              </div>
            )}

            {/* 決策訊號 */}
            {signal && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-base font-semibold text-gray-900 mb-3">決策樹訊號</h3>
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    signal.level === "strong" ? "bg-green-500" :
                    signal.level === "sell" ? "bg-red-500" : "bg-yellow-500"
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-gray-900 mb-1">{signal.action}</div>
                    <div className="text-xs text-gray-500">{signal.reason}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
