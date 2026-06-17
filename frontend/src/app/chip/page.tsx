"use client";

import { Search, BarChart3, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area } from "recharts";
import api from "@/lib/api";

interface ChipDataPoint {
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  proprietary_net: number | null;
  margin_balance: number | null;
  margin_net: number | null;
}

interface ForeignAnomaly {
  enough_data: boolean;
  foreign_daily_avg?: number;
  foreign_latest?: number;
  zscore?: number;
  volume_abnormal?: boolean;
  recent_5d_net?: number;
  prior_5d_net?: number;
  turning?: string;
  current_streak?: number;
  max_streak_in_window?: number;
  streak_abnormal?: boolean;
  window_days?: number;
}

interface DealerFlow {
  foreign_net_buy: number;
  invest_trust_net_buy: number;
  proprietary_net_buy: number;
  foreign_consecutive_days: number;
  invest_trust_consecutive_days: number;
  trend: string;
  signal: string;
  anomaly?: ForeignAnomaly;
}

interface MarginTrading {
  margin_balance: number;
  margin_net_buy: number;
  margin_trend: string;
  signal: string;
}

interface Concentration {
  concentration_ratio: number | null;
  large_holder_trend: string;
  retail_ratio: number | null;
  signal: string;
  big_holder_ratio?: number;   // 千張大戶持股 %（TDCC）
  big_holder_change?: number;  // 週變化（百分點）
  week_date?: string;
  source?: string;             // tdcc / proxy / none
}

interface ChipAnalysisResult {
  stock_code: string;
  score: number;
  signal: string;
  dealer_flow: DealerFlow;
  margin_trading: MarginTrading;
  concentration: Concentration;
  analyzed_at: string;
}

export default function ChipPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");
  const [stockName, setStockName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [chipData, setChipData] = useState<ChipDataPoint[]>([]);
  const [chipResult, setChipResult] = useState<ChipAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      let rawData: ChipDataPoint[] = [];

      try {
        // 取得股票名稱
        try {
          const stockRes = await api.get(`/api/stocks/${selectedCode}`);
          setStockName(stockRes.data?.name || selectedCode);
        } catch {
          setStockName(selectedCode);
        }

        // 取得籌碼原始數據
        try {
          const chipRes = await api.get(`/api/stocks/${selectedCode}/chip?days=30`);
          rawData = chipRes.data?.data || [];
          setChipData(
            rawData.map((d) => ({
              ...d,
              date: new Date(d.date).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
            }))
          );
        } catch {
          rawData = [];
          setChipData([]);
        }

        // 取得籌碼分析結果
        try {
          const analysisRes = await api.get(`/api/analysis/chip/${selectedCode}?days=90`);
          setChipResult(analysisRes.data);
        } catch {
          console.warn("無法取得籌碼分析結果，使用前端計算");
          const fallbackResult = calculateFallbackResult(rawData);
          setChipResult(fallbackResult);
        }
      } catch (err) {
        console.error("籌碼數據載入失敗:", err);
        setError("數據載入失敗，請稍後再試");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  const formatValue = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    const absVal = Math.abs(val);
    if (absVal >= 100000000) {
      return `${sign}${(val / 100000000).toFixed(1)}億`;
    } else if (absVal >= 10000) {
      return `${sign}${(val / 10000).toFixed(1)}萬`;
    }
    return `${sign}${val.toFixed(0)}`;
  };

  const formatMoney = (val: number | null) => {
    if (val === null) return "-";
    return formatValue(val);
  };

  const signalColor = (signal: string) => {
    if (signal === "bullish" || signal === "buy" || signal === "strong_buy") return "text-green-600 bg-green-50";
    if (signal === "bearish" || signal === "sell" || signal === "strong_sell") return "text-red-600 bg-red-50";
    return "text-gray-600 bg-gray-50";
  };

  const signalText = (signal: string) => {
    const map: Record<string, string> = {
      bullish: "正面",
      bearish: "負面",
      neutral: "中性",
      buy: "買入",
      strong_buy: "強烈買入",
      sell: "賣出",
      strong_sell: "強烈賣出",
    };
    return map[signal] || signal;
  };

  const trendText = (trend: string) => {
    const map: Record<string, string> = {
      strong_buy: "強勁買超",
      buy: "買超",
      neutral: "持平",
      sell: "賣超",
      strong_sell: "強勁賣超",
      increasing: "增加",
      decreasing: "減少",
      accumulating: "集中",
      distributing: "分散",
      stable: "穩定",
    };
    return map[trend] || trend;
  };

  const largeHolderTrendText = (trend: string) => {
    const map: Record<string, string> = {
      accumulating: "大戶集中",
      distributing: "大戶分散",
      stable: "持平",
    };
    return map[trend] || trend;
  };

  // 千張大戶持股 %（TDCC 真資料優先；否則用舊集中度比例代理）
  const concPct = (c: Concentration) =>
    c.big_holder_ratio ?? (c.concentration_ratio != null ? c.concentration_ratio * 100 : null);
  const retailPct = (c: Concentration) => (c.retail_ratio != null ? c.retail_ratio * 100 : null);
  const pctText = (v: number | null | undefined) => (v != null ? `${v.toFixed(0)}%` : "--");

  // 計算近 5 日加總
  const recent5Summary = useMemo(() => {
    if (chipData.length === 0) return null;
    const recent = chipData.slice(-5);
    return {
      foreign: recent.reduce((sum, d) => sum + (d.foreign_net || 0), 0),
      trust: recent.reduce((sum, d) => sum + (d.trust_net || 0), 0),
      proprietary: recent.reduce((sum, d) => sum + (d.proprietary_net || 0), 0),
    };
  }, [chipData]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">籌碼分析</h1>
            <p className="text-sm text-gray-500">法人動向、融資融券、籌碼集中度追蹤</p>
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
              className="pl-9 pr-4 py-2 w-48 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            分析
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 籌碼決策分析 - 主要段落 */}
      {chipResult && (
        <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl border border-green-200 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {stockName || selectedCode} ({selectedCode}) - 籌碼面分析
                </h2>
                <p className="text-sm text-gray-500">綜合法人動向、融資融券、籌碼集中度</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-4xl font-bold text-green-600">{chipResult.score}</div>
                <div className="text-xs text-gray-500">綜合評分</div>
              </div>
              <div className={`px-4 py-2 rounded-full text-base font-bold ${signalColor(chipResult.signal)}`}>
                {signalText(chipResult.signal)}
              </div>
            </div>
          </div>

          {/* 策略卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {/* 法人動向 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">法人動向</div>
              <div className="text-2xl font-bold text-green-600 mb-1">
                {formatValue(chipResult.dealer_flow.foreign_net_buy)}
              </div>
              <div className="text-xs text-gray-500">外資淨買超</div>
              <div className={`mt-2 px-2 py-1 rounded text-xs font-medium ${signalColor(chipResult.dealer_flow.signal)}`}>
                {signalText(chipResult.dealer_flow.signal)}
              </div>
            </div>

            {/* 外資連買 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">外資連買</div>
              <div className="text-2xl font-bold text-blue-600 mb-1">
                {Math.abs(chipResult.dealer_flow.foreign_consecutive_days)}
              </div>
              <div className="text-xs text-gray-500">天</div>
              <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                {chipResult.dealer_flow.foreign_consecutive_days > 0 ? "連續買超" : "連續賣超"}
              </div>
            </div>

            {/* 投信動向 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">投信動向</div>
              <div className="text-2xl font-bold text-emerald-600 mb-1">
                {formatValue(chipResult.dealer_flow.invest_trust_net_buy)}
              </div>
              <div className="text-xs text-gray-500">投信淨買超</div>
              <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                {chipResult.dealer_flow.invest_trust_consecutive_days > 0 ? "連買" : "連賣"}
              </div>
            </div>

            {/* 融資趨勢 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">融資趨勢</div>
              <div className="text-2xl font-bold text-orange-600 mb-1">
                {formatValue(chipResult.margin_trading.margin_balance)}
              </div>
              <div className="text-xs text-gray-500">融資餘額</div>
              <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-orange-50 text-orange-700">
                {trendText(chipResult.margin_trading.margin_trend)}
              </div>
            </div>

            {/* 籌碼集中度（TDCC 千張大戶持股比） */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">
                {chipResult.concentration.source === "tdcc" ? "千張大戶持股" : "籌碼集中度"}
              </div>
              <div className="text-2xl font-bold text-purple-600 mb-1">
                {pctText(concPct(chipResult.concentration))}
              </div>
              <div className="text-xs text-gray-500">
                {chipResult.concentration.source === "tdcc" ? "集保 ≥1000 張" : "大戶持倉比"}
              </div>
              <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700">
                {largeHolderTrendText(chipResult.concentration.large_holder_trend)}
                {chipResult.concentration.source === "tdcc" && chipResult.concentration.big_holder_change != null
                  ? `（週${chipResult.concentration.big_holder_change >= 0 ? "+" : ""}${chipResult.concentration.big_holder_change}pp）`
                  : ""}
              </div>
            </div>

            {/* 非大戶比例 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
              <div className="text-xs text-gray-500 mb-2">非大戶比例</div>
              <div className="text-2xl font-bold text-red-600 mb-1">
                {pctText(retailPct(chipResult.concentration))}
              </div>
              <div className="text-xs text-gray-500">散戶 / 中實戶</div>
              <div className="mt-2 px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700">
                {(retailPct(chipResult.concentration) ?? 0) > 40 ? "偏高" : "正常"}
              </div>
            </div>
          </div>

          {/* 綜合操作建議 */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-green-100">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-green-600" />
              綜合籌碼操作建議
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm font-medium text-green-700 mb-2">籌碼評分解讀</div>
                <div className="text-sm text-gray-700">
                  {chipResult.score >= 70
                    ? "籌碼面偏多，法人買超明顯，建議可逢低佈局"
                    : chipResult.score >= 50
                    ? "籌碼面中性，法人動向不明顯，建議觀望"
                    : "籌碼面偏空，法人賣超明顯，建議謹慎操作"}
                </div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium text-blue-700 mb-2">法人動向參考</div>
                <div className="text-sm text-gray-700">
                  外資{chipResult.dealer_flow.foreign_consecutive_days > 0 ? "連買" : "連賣"}
                  {Math.abs(chipResult.dealer_flow.foreign_consecutive_days)}天，
                  投信{chipResult.dealer_flow.invest_trust_consecutive_days > 0 ? "連買" : "連賣"}
                  {Math.abs(chipResult.dealer_flow.invest_trust_consecutive_days)}天，
                  {trendText(chipResult.dealer_flow.trend)}
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm font-medium text-purple-700 mb-2">籌碼集中度參考</div>
                <div className="text-sm text-gray-700">
                  大戶{largeHolderTrendText(chipResult.concentration.large_holder_trend)}，
                  非大戶比例{pctText(retailPct(chipResult.concentration))}
                  {(retailPct(chipResult.concentration) ?? 0) > 40 ? "，注意散戶追高風險" : "，籌碼結構健康"}
                  {chipResult.concentration.source === "tdcc" && chipResult.concentration.week_date
                    ? `（集保 ${chipResult.concentration.week_date}）`
                    : ""}
                </div>
              </div>
            </div>

            {/* 外資動向細緻化：常態 vs 異常、近期轉折、與均值對比 */}
            {chipResult.dealer_flow.anomaly?.enough_data && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="text-sm font-semibold text-gray-800 mb-3">
                  外資動向細緻化
                  <span className="text-xs font-normal text-gray-400 ml-2">
                    （近 {chipResult.dealer_flow.anomaly.window_days} 個交易日）
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 連續天數常態 vs 異常 */}
                  <div className="p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">連續天數判讀</div>
                    <div className="text-sm text-gray-700">
                      {chipResult.dealer_flow.anomaly.streak_abnormal ? (
                        <span className="text-red-600 font-medium">
                          異常：連{(chipResult.dealer_flow.anomaly.current_streak ?? 0) > 0 ? "買" : "賣"}
                          {Math.abs(chipResult.dealer_flow.anomaly.current_streak ?? 0)}天，為區間內最長
                        </span>
                      ) : (
                        <span className="text-gray-600">
                          常態：目前連續天數未達區間極值
                          （區間最長 {chipResult.dealer_flow.anomaly.max_streak_in_window} 天）
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 近期轉折 */}
                  <div className="p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">近 5 日轉折</div>
                    <div className="text-sm font-medium text-gray-800">{chipResult.dealer_flow.anomaly.turning}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      近5日 {formatMoney(chipResult.dealer_flow.anomaly.recent_5d_net ?? 0)}
                      ・前5日 {formatMoney(chipResult.dealer_flow.anomaly.prior_5d_net ?? 0)}
                    </div>
                  </div>

                  {/* 與均值對比 */}
                  <div className="p-3 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">最新 vs 區間日均</div>
                    <div className={`text-sm font-medium ${chipResult.dealer_flow.anomaly.volume_abnormal ? "text-red-600" : "text-gray-800"}`}>
                      {chipResult.dealer_flow.anomaly.volume_abnormal ? "量能異常" : "量能常態"}
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        (z={chipResult.dealer_flow.anomaly.zscore})
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      最新 {formatMoney(chipResult.dealer_flow.anomaly.foreign_latest ?? 0)}
                      ・日均 {formatMoney(chipResult.dealer_flow.anomaly.foreign_daily_avg ?? 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && !chipResult ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-40 bg-gray-200 rounded"></div>
          </div>
        </div>
      ) : (
        <>
          {/* 三大法人買賣超 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">三大法人買賣超 (近 30 日)</h3>
              {recent5Summary && (
                <div className="flex gap-4 text-sm">
                  <span className="text-blue-600">外資 5 日: {formatMoney(recent5Summary.foreign)}</span>
                  <span className="text-green-600">投信 5 日: {formatMoney(recent5Summary.trust)}</span>
                  <span className="text-yellow-600">自營 5 日: {formatMoney(recent5Summary.proprietary)}</span>
                </div>
              )}
            </div>
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chipData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(value) => formatValue(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => [
                      formatMoney(Number(value)),
                      name === "foreign_net" ? "外資" : name === "trust_net" ? "投信" : "自營商",
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="foreign_net" name="外資" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="trust_net" name="投信" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="proprietary_net" name="自營商" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 融資融券 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">融資餘額趨勢</h3>
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chipData}>
                  <defs>
                    <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(value) => `${(value / 10000).toFixed(0)}萬`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${Number(value).toLocaleString()} 張`, "融資餘額"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="margin_balance"
                    name="融資餘額"
                    stroke="#ef4444"
                    fill="url(#colorMargin)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 籌碼集中度 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">籌碼集中度分析</h3>
            {chipResult ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    {pctText(concPct(chipResult.concentration))}
                  </div>
                  <div className="text-sm text-gray-500">
                    {chipResult.concentration.source === "tdcc" ? "千張大戶持股比" : "大戶集中度"}
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    {largeHolderTrendText(chipResult.concentration.large_holder_trend)}
                    {chipResult.concentration.source === "tdcc" && chipResult.concentration.big_holder_change != null
                      ? `　週${chipResult.concentration.big_holder_change >= 0 ? "+" : ""}${chipResult.concentration.big_holder_change}pp`
                      : ""}
                  </div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-orange-600 mb-1">
                    {pctText(retailPct(chipResult.concentration))}
                  </div>
                  <div className="text-sm text-gray-500">非大戶比例</div>
                  <div className="text-xs text-gray-500 mt-1">{chipResult.concentration.source === "tdcc" ? "集保資料" : "持倉分散度"}</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600 mb-1">
                    {Math.abs(chipResult.dealer_flow.foreign_consecutive_days)}
                  </div>
                  <div className="text-sm text-gray-500">外資連續天數</div>
                  <div className="text-xs text-green-600 mt-1">
                    {chipResult.dealer_flow.foreign_consecutive_days > 0 ? "連買" : "連賣"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                暫無籌碼集中度數據
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 前端 fallback 計算（從真實原始數據推算，非隨機）
function calculateFallbackResult(data: ChipDataPoint[]): ChipAnalysisResult {
  if (data.length === 0) {
    return {
      stock_code: "",
      score: 50,
      signal: "neutral",
      dealer_flow: {
        foreign_net_buy: 0,
        invest_trust_net_buy: 0,
        proprietary_net_buy: 0,
        foreign_consecutive_days: 0,
        invest_trust_consecutive_days: 0,
        trend: "neutral",
        signal: "neutral",
      },
      margin_trading: {
        margin_balance: 0,
        margin_net_buy: 0,
        margin_trend: "neutral",
        signal: "neutral",
      },
      concentration: {
        concentration_ratio: 1,
        large_holder_trend: "stable",
        retail_ratio: 0.5,
        signal: "neutral",
      },
      analyzed_at: new Date().toISOString(),
    };
  }

  // 法人動向
  const foreignNet = data.reduce((sum, d) => sum + (d.foreign_net || 0), 0);
  const trustNet = data.reduce((sum, d) => sum + (d.trust_net || 0), 0);
  const proprietaryNet = data.reduce((sum, d) => sum + (d.proprietary_net || 0), 0);

  let foreignConsecutive = 0;
  for (const d of data) {
    if (d.foreign_net && d.foreign_net > 0) foreignConsecutive++;
    else if (d.foreign_net && d.foreign_net < 0) foreignConsecutive--;
    else break;
  }

  let trustConsecutive = 0;
  for (const d of data) {
    if (d.trust_net && d.trust_net > 0) trustConsecutive++;
    else if (d.trust_net && d.trust_net < 0) trustConsecutive--;
    else break;
  }

  let dealerTrend = "neutral";
  let dealerSignal = "neutral";
  if (foreignNet > 100000000 && trustNet > 50000000) {
    dealerTrend = "strong_buy";
    dealerSignal = "bullish";
  } else if (foreignNet > 50000000) {
    dealerTrend = "buy";
    dealerSignal = "bullish";
  } else if (foreignNet < -100000000 && trustNet < -50000000) {
    dealerTrend = "strong_sell";
    dealerSignal = "bearish";
  } else if (foreignNet < -50000000) {
    dealerTrend = "sell";
    dealerSignal = "bearish";
  }

  // 融資趨勢
  const latest = data[data.length - 1];
  const marginBalance = latest?.margin_balance || 0;

  let marginTrend = "neutral";
  let marginSignal = "neutral";
  if (data.length >= 10) {
    const recent5 = data.slice(-5);
    const old5 = data.slice(-10, -5);
    const recentAvg = recent5.reduce((s, d) => s + (d.margin_balance || 0), 0) / 5;
    const oldAvg = old5.reduce((s, d) => s + (d.margin_balance || 0), 0) / 5;
    marginTrend = recentAvg > oldAvg ? "increasing" : "decreasing";
    marginSignal = marginTrend === "increasing" ? "bearish" : "neutral";
  }

  // 籌碼集中度
  let concentrationRatio = 1.0;
  let largeHolderTrend = "stable";
  let concentrationSignal = "neutral";

  if (data.length >= 20) {
    const recentInstitutional = data.slice(-10).reduce(
      (s, d) => s + (d.foreign_net || 0) + (d.trust_net || 0),
      0
    );
    const olderInstitutional = data.slice(-20, -10).reduce(
      (s, d) => s + (d.foreign_net || 0) + (d.trust_net || 0),
      0
    );

    if (recentInstitutional > 0 && recentInstitutional > olderInstitutional) {
      largeHolderTrend = "accumulating";
      concentrationSignal = "bullish";
      concentrationRatio = 1.3;
    } else if (recentInstitutional < 0) {
      largeHolderTrend = "distributing";
      concentrationSignal = "bearish";
      concentrationRatio = 0.7;
    }
  }

  // 評分
  let score = 50;
  if (dealerSignal === "bullish") score += 15;
  else if (dealerSignal === "bearish") score -= 15;
  if (marginSignal === "bullish") score += 10;
  else if (marginSignal === "bearish") score -= 10;
  if (concentrationSignal === "bullish") score += 10;
  else if (concentrationSignal === "bearish") score -= 10;
  score = Math.max(0, Math.min(100, score));

  let overallSignal = "neutral";
  if (score >= 70) overallSignal = "strong_buy";
  else if (score >= 60) overallSignal = "buy";
  else if (score >= 40) overallSignal = "neutral";
  else if (score >= 30) overallSignal = "sell";
  else overallSignal = "strong_sell";

  return {
    stock_code: "",
    score,
    signal: overallSignal,
    dealer_flow: {
      foreign_net_buy: foreignNet,
      invest_trust_net_buy: trustNet,
      proprietary_net_buy: proprietaryNet,
      foreign_consecutive_days: foreignConsecutive,
      invest_trust_consecutive_days: trustConsecutive,
      trend: dealerTrend,
      signal: dealerSignal,
    },
    margin_trading: {
      margin_balance: marginBalance,
      margin_net_buy: latest?.margin_net || 0,
      margin_trend: marginTrend,
      signal: marginSignal,
    },
    concentration: {
      concentration_ratio: concentrationRatio,
      large_holder_trend: largeHolderTrend,
      retail_ratio: 1 / (concentrationRatio + 1),
      signal: concentrationSignal,
    },
    analyzed_at: new Date().toISOString(),
  };
}
