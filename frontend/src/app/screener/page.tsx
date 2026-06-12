"use client";

import { useState } from "react";
import { Search, Filter, TrendingUp, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

interface ScreenerParams {
  rsi_min: number;
  rsi_max: number;
  foreign_consecutive_buy: number;
  atr_pct_min: number;
  atr_pct_max: number;
  adtv_min: number;
  price_max: number;
  breakout_bars: number;
  limit: number;
}

interface ScreenerResult {
  code: string;
  name: string;
  price: number;
  rsi: number;
  atr_pct: number;
  adtv_10: number;
  breakout_20: boolean;
  breakout_60: boolean;
  breakout_120: boolean;
  breakout_180: boolean;
  momentum_breakout: boolean;
  foreign_consecutive_days: number;
  latest_foreign_net: number;
}

const DEFAULT_PARAMS: ScreenerParams = {
  rsi_min: 0,
  rsi_max: 100,
  foreign_consecutive_buy: 0,
  atr_pct_min: 0,
  atr_pct_max: 100,
  adtv_min: 0,
  price_max: 0,
  breakout_bars: 0,
  limit: 20,
};

// Graphcue 式波動度策略預設
const PRESETS: Array<{ label: string; desc: string; params: Partial<ScreenerParams> }> = [
  { label: "短期高波動", desc: "ATR14 > 6%", params: { atr_pct_min: 6 } },
  { label: "中期極波動 (<30)", desc: "ATR>6% · 均量1萬張 · 價<30", params: { atr_pct_min: 6, adtv_min: 10000, price_max: 30 } },
  { label: "中期中波動", desc: "ATR14 3–6%", params: { atr_pct_min: 3, atr_pct_max: 6 } },
  { label: "長期低波動", desc: "ATR14 < 3%", params: { atr_pct_max: 3 } },
  { label: "60根高點突破", desc: "突破前60根高點", params: { breakout_bars: 60 } },
  { label: "120根高點突破", desc: "突破前120根高點", params: { breakout_bars: 120 } },
  { label: "180根高點突破", desc: "突破前180根高點", params: { breakout_bars: 180 } },
  { label: "外資連買強勢", desc: "外資連買 ≥3 天", params: { foreign_consecutive_buy: 3 } },
];

export default function ScreenerPage() {
  const [params, setParams] = useState<ScreenerParams>(DEFAULT_PARAMS);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [triggered, setTriggered] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ results: ScreenerResult[]; total: number }>({
    queryKey: ["screener", params],
    queryFn: async () => {
      const res = await api.get("/api/stocks/screen", { params });
      return res.data;
    },
    enabled: triggered,
    staleTime: 2 * 60 * 1000,
  });

  const applyPreset = (idx: number) => {
    setActivePreset(idx);
    setParams({ ...DEFAULT_PARAMS, ...PRESETS[idx].params });
    setTriggered(false);
  };

  const updateParam = (key: keyof ScreenerParams, value: number) => {
    setActivePreset(null);
    setParams((p) => ({ ...p, [key]: value }));
  };

  const handleSearch = () => {
    setTriggered(true);
    refetch();
  };

  const formatNet = (val: number) => {
    if (!val) return "--";
    const sign = val >= 0 ? "+" : "";
    return `${sign}${(val / 10000).toFixed(0)}百萬`;
  };

  const formatVol = (val: number) => {
    if (val >= 10000) return `${(val / 10000).toFixed(1)}萬張`;
    return `${val.toFixed(0)}張`;
  };

  const atrColor = (pct: number) => {
    if (pct > 6) return "text-red-600 bg-red-50";
    if (pct >= 3) return "text-yellow-700 bg-yellow-50";
    return "text-green-700 bg-green-50";
  };

  return (
    <div>
      <PageHeader
        eyebrow="Screener"
        title="股票篩選器"
        description="依波動度、N根突破、外資動向掃描全市場 2,300+ 檔，內建 8 種策略預設"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 篩選條件 sidebar */}
        <div className="space-y-5">
          {/* 策略預設 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">波動度策略</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(i)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    activePreset === i
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <div className="font-medium text-xs">{p.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 波動度 ATR14% */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">波動度 ATR14（%）</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">最低</label>
                <input
                  type="number" value={params.atr_pct_min} min={0} step={0.5}
                  onChange={(e) => updateParam("atr_pct_min", Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">最高</label>
                <input
                  type="number" value={params.atr_pct_max} min={0} step={0.5}
                  onChange={(e) => updateParam("atr_pct_max", Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">低波動 &lt;3%　中波動 3–6%　高波動 &gt;6%</p>
          </div>

          {/* 流動性與價格 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">10日均量下限（張）</label>
              <input
                type="number" value={params.adtv_min} min={0} step={1000}
                onChange={(e) => updateParam("adtv_min", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">價格上限（0 = 不限）</label>
              <input
                type="number" value={params.price_max} min={0} step={5}
                onChange={(e) => updateParam("price_max", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 突破與其他 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">N根高點突破</label>
              <select
                value={params.breakout_bars}
                onChange={(e) => updateParam("breakout_bars", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>不篩選</option>
                <option value={20}>突破前 20 根高點（短期）</option>
                <option value={60}>突破前 60 根高點（中期）</option>
                <option value={120}>突破前 120 根高點（長期）</option>
                <option value={180}>突破前 180 根高點（長期）</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">外資連買天數</label>
              <select
                value={params.foreign_consecutive_buy}
                onChange={(e) => updateParam("foreign_consecutive_buy", Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>不限</option>
                <option value={1}>≥ 1 天</option>
                <option value={3}>≥ 3 天</option>
                <option value={5}>≥ 5 天</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                掃描中（需計算全市場指標）...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                開始篩選
              </>
            )}
          </button>
        </div>

        {/* 結果列表 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">候選列表</h3>
              {data && (
                <span className="text-sm text-gray-500">共 {data.total} 筆，顯示 {data.results.length} 筆</span>
              )}
            </div>

            {!triggered && !data ? (
              <div className="py-16 text-center">
                <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">選擇策略或設定條件後點擊「開始篩選」</p>
              </div>
            ) : isLoading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">正在掃描股票資料...</p>
              </div>
            ) : data?.results.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-gray-400 text-sm">沒有符合條件的股票</p>
                <p className="text-gray-300 text-xs mt-1">請放寬篩選條件</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-2.5 px-4 font-medium">個股</th>
                      <th className="text-right py-2.5 px-3 font-medium">價格</th>
                      <th className="text-right py-2.5 px-3 font-medium">ATR14%</th>
                      <th className="text-right py-2.5 px-3 font-medium">10日均量</th>
                      <th className="text-center py-2.5 px-3 font-medium">突破</th>
                      <th className="text-right py-2.5 px-3 font-medium">RSI</th>
                      <th className="text-right py-2.5 px-3 font-medium">外資</th>
                      <th className="py-2.5 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.results.map((stock) => (
                      <tr key={stock.code} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <Link href={`/stock/${stock.code}`} className="hover:text-blue-600">
                            <span className="font-bold text-gray-900">{stock.code}</span>
                            <span className="text-gray-600 ml-2 text-xs">{stock.name}</span>
                          </Link>
                        </td>
                        <td className="text-right py-3 px-3 font-mono">{stock.price?.toFixed(2)}</td>
                        <td className="text-right py-3 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${atrColor(stock.atr_pct)}`}>
                            {stock.atr_pct?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-gray-600">
                          {formatVol(stock.adtv_10)}
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {stock.breakout_180 ? (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">180根</span>
                            ) : stock.breakout_120 ? (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">120根</span>
                            ) : stock.breakout_60 ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">60根</span>
                            ) : stock.breakout_20 ? (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">20根</span>
                            ) : (
                              <span className="text-[10px] text-gray-300">—</span>
                            )}
                            {stock.momentum_breakout && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded" title="動能突破">
                                <Zap className="w-2.5 h-2.5 inline" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`text-right py-3 px-3 font-mono text-xs ${
                          stock.rsi > 70 ? "text-red-600" : stock.rsi < 30 ? "text-green-600" : "text-gray-700"
                        }`}>
                          {stock.rsi?.toFixed(0)}
                        </td>
                        <td className="text-right py-3 px-3 text-xs">
                          {stock.foreign_consecutive_days > 0 ? (
                            <span className="text-red-600">連買{stock.foreign_consecutive_days}天</span>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <Link href={`/stock/${stock.code}`}>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
