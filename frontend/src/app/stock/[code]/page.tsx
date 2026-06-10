"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Loader2, BarChart3, Activity, Brain, LineChart } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import CandlestickChart, { type TechnicalAnnotation } from "@/components/technical/CandlestickChart";
import KLineIntervalSelector from "@/components/technical/KLineIntervalSelector";
import ScoreBreakdownCard from "@/components/decision/ScoreBreakdownCard";
import RadarChartComponent from "@/components/decision/RadarChartComponent";
import api from "@/lib/api";

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
  const [sentimentData, setSentimentData] = useState<any>(null);

  // 獲取股票基本資訊
  useEffect(() => {
    const fetchStock = async () => {
      try {
        const res = await api.get(`/api/stocks/${code}`);
        setStockName(res.data?.name || code);
      } catch {
        setStockName(code);
      }
    };
    fetchStock();
  }, [code]);

  // 獲取 K 線數據
  useEffect(() => {
    const fetchKline = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/stocks/${code}/kline`, {
          params: { interval, limit: 120 },
        });
        const rawData = res.data?.data || [];
        const formatted: KLineData[] = rawData.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
          open: item.open ?? 0,
          high: item.high ?? 0,
          low: item.low ?? 0,
          close: item.close ?? 0,
          volume: item.volume ?? 0,
        }));
        setKlineData(formatted);
      } catch {
        // Fallback mock data
        const mock = generateMockData(code);
        setKlineData(mock);
      } finally {
        setLoading(false);
      }
    };
    fetchKline();
  }, [code, interval]);

  // 獲取決策評分
  useEffect(() => {
    const fetchScore = async () => {
      try {
        const res = await api.get(`/api/decision/score/${code}`);
        setScoreData(res.data);
      } catch {
        // 評分 API 可能尚未就緒
      }
    };
    fetchScore();
  }, [code]);

  // 獲取雷達圖數據
  useEffect(() => {
    const fetchRadar = async () => {
      try {
        const res = await api.get(`/api/decision/radar/${code}`);
        setRadarData(res.data);
      } catch {
        // 雷達圖 API 可能尚未就緒
      }
    };
    fetchRadar();
  }, [code]);

  // 獲取訊號
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await api.get(`/api/decision/signals`, {
          params: { stock_code: code },
        });
        setSignals(res.data || []);
      } catch {
        setSignals([]);
      }
    };
    fetchSignals();
  }, [code]);

  // 獲取籌碼數據
  useEffect(() => {
    const fetchChip = async () => {
      try {
        const res = await api.get(`/api/stocks/${code}/chip?days=30`);
        setChipData(res.data?.data || []);
      } catch {
        setChipData([]);
      }
    };
    fetchChip();
  }, [code]);

  // 獲取情緒數據
  useEffect(() => {
    const fetchSentiment = async () => {
      try {
        const res = await api.get(`/api/analysis/sentiment/${code}`);
        setSentimentData(res.data);
      } catch {
        setSentimentData(null);
      }
    };
    fetchSentiment();
  }, [code]);

  const currentPrice = useMemo(() => {
    if (klineData.length === 0) return null;
    return klineData[klineData.length - 1].close;
  }, [klineData]);

  const priceChange = useMemo(() => {
    if (klineData.length < 2) return { value: 0, percent: 0 };
    const prev = klineData[klineData.length - 2].close;
    const curr = klineData[klineData.length - 1].close;
    return {
      value: curr - prev,
      percent: ((curr - prev) / prev) * 100,
    };
  }, [klineData]);

  const isUp = priceChange.value >= 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
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
                <h1 className="text-xl font-bold text-gray-900">
                  {stockName || code}
                </h1>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold font-mono">{currentPrice?.toFixed(2) || "--"}</span>
                  {priceChange.value !== 0 && (
                    <span className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
                      {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {isUp ? "+" : ""}{priceChange.value.toFixed(2)} ({isUp ? "+" : ""}{priceChange.percent.toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Score Badge */}
            {scoreData && (
              <div className={`px-4 py-2 rounded-xl ${
                scoreData.total_score >= 70 ? "bg-green-50 text-green-700" :
                scoreData.total_score >= 50 ? "bg-yellow-50 text-yellow-700" :
                "bg-red-50 text-red-700"
              }`}>
                <div className="text-xs font-medium">綜合評分</div>
                <div className="text-2xl font-bold">{scoreData.total_score ?? "--"}</div>
              </div>
            )}
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
        {loading && activeTab === "technical" ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : activeTab === "technical" ? (
          <div className="space-y-6">
            {/* K Line Chart */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">K 線圖</h2>
                <KLineIntervalSelector selected={interval} onChange={setInterval} disabled={loading} />
              </div>
              <CandlestickChart data={klineData} annotations={annotations} height={450} />
            </div>

            {/* Signals */}
            {signals.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">技術訊號</h3>
                <div className="space-y-2">
                  {signals.slice(0, 5).map((signal, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {signal.type === "buy" ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : signal.type === "sell" ? (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      ) : (
                        <Minus className="w-5 h-5 text-gray-400" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{signal.message}</div>
                        <div className="text-xs text-gray-500">{signal.source}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        signal.type === "buy" ? "bg-green-100 text-green-700" :
                        signal.type === "sell" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {signal.type === "buy" ? "看多" : signal.type === "sell" ? "看空" : "中性"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "chip" ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">籌碼分析</h2>
            {chipData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 px-3 text-left">日期</th>
                      <th className="py-2 px-3 text-right">外資買賣超</th>
                      <th className="py-2 px-3 text-right">投信買賣超</th>
                      <th className="py-2 px-3 text-right">自營商買賣超</th>
                      <th className="py-2 px-3 text-right">融資餘額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chipData.slice(-10).reverse().map((row: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-3">{row.date}</td>
                        <td className={`py-2 px-3 text-right font-mono ${row.foreign_net >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {row.foreign_net != null ? (row.foreign_net / 1000000).toFixed(2) + "M" : "--"}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${row.trust_net >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {row.trust_net != null ? (row.trust_net / 1000000).toFixed(2) + "M" : "--"}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono ${row.proprietary_net >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {row.proprietary_net != null ? (row.proprietary_net / 1000000).toFixed(2) + "M" : "--"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {row.margin_balance != null ? (row.margin_balance / 1000000).toFixed(2) + "M" : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                暫無籌碼數據
              </div>
            )}
          </div>
        ) : activeTab === "sentiment" ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">情緒分析</h2>
            {sentimentData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-xl">
                    <div className="text-sm text-green-600">正面新聞</div>
                    <div className="text-2xl font-bold text-green-700">{sentimentData.positive_count ?? 0}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <div className="text-sm text-gray-600">中性新聞</div>
                    <div className="text-2xl font-bold text-gray-700">{sentimentData.neutral_count ?? 0}</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl">
                    <div className="text-sm text-red-600">負面新聞</div>
                    <div className="text-2xl font-bold text-red-700">{sentimentData.negative_count ?? 0}</div>
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl">
                  <div className="text-sm text-blue-600 mb-2">情緒評分</div>
                  <div className="text-3xl font-bold text-blue-700">{sentimentData.score ?? "--"}/100</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                暫無情緒數據
              </div>
            )}
          </div>
        ) : activeTab === "decision" ? (
          <div className="space-y-6">
            {/* Score Breakdown */}
            <ScoreBreakdownCard
              scores={scoreData?.breakdown || {}}
              totalScore={scoreData?.total_score || 0}
              loading={!scoreData}
            />

            {/* Radar Chart */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">能力雷達圖</h3>
              <RadarChartComponent data={radarData} stockCode={code} loading={!radarData} />
            </div>

            {/* Pattern Info */}
            {scoreData?.recent_patterns && scoreData.recent_patterns.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">近期 K 線形態</h3>
                <div className="space-y-2">
                  {scoreData.recent_patterns.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className={`w-2 h-2 rounded-full ${
                        p.score > 0 ? "bg-green-500" : p.score < 0 ? "bg-red-500" : "bg-gray-400"
                      }`} />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.date}</div>
                      </div>
                      <span className={`text-sm font-mono ${
                        p.score > 0 ? "text-green-600" : p.score < 0 ? "text-red-600" : "text-gray-500"
                      }`}>
                        {p.score > 0 ? "+" : ""}{p.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function generateMockData(code: string): KLineData[] {
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
