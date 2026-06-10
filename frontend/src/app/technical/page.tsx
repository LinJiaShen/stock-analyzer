"use client";

import { Search, TrendingUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";

export default function TechnicalPage() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code");
  const [searchCode, setSearchCode] = useState(codeFromUrl || "2330");
  const [selectedCode, setSelectedCode] = useState(codeFromUrl || "2330");

  // 模擬 K 線數據
  const klineData = [
    { date: "01/02", open: 560, high: 568, low: 558, close: 565, volume: 35000 },
    { date: "01/03", open: 565, high: 572, low: 562, close: 570, volume: 42000 },
    { date: "01/06", open: 570, high: 575, low: 565, close: 568, volume: 38000 },
    { date: "01/07", open: 568, high: 578, low: 566, close: 575, volume: 45000 },
    { date: "01/08", open: 575, high: 580, low: 572, close: 578, volume: 48000 },
    { date: "01/09", open: 578, high: 582, low: 574, close: 576, volume: 41000 },
    { date: "01/10", open: 576, high: 585, low: 575, close: 582, volume: 52000 },
    { date: "01/13", open: 582, high: 588, low: 579, close: 585, volume: 55000 },
    { date: "01/14", open: 585, high: 590, low: 580, close: 588, volume: 48000 },
    { date: "01/15", open: 588, high: 592, low: 585, close: 590, volume: 46000 },
  ];

  // 模擬 MA 數據
  const maData = klineData.map((d) => ({
    date: d.date,
    close: d.close,
    ma5: d.close - 2 + Math.random() * 4,
    ma10: d.close - 5 + Math.random() * 10,
    ma20: d.close - 8 + Math.random() * 16,
  }));

  // 模擬 RSI 數據
  const rsiData = klineData.map((d) => ({
    date: d.date,
    rsi: 55 + Math.random() * 20,
  }));

  // 模擬 MACD 數據
  const macdData = klineData.map((d) => ({
    date: d.date,
    macd: -2 + Math.random() * 4,
    signal: -1 + Math.random() * 3,
    histogram: -1 + Math.random() * 2,
  }));

  // 模擬技術指標結果
  const technicalResult = {
    score: 80,
    signal: "買入",
    ma_alignment: "多頭排列",
    trend: { direction: "上升", strength: 78 },
    rsi: 62,
    macd: { macd_line: 1.5, signal_line: 1.2, histogram: 0.3 },
    kdj: { k: 65, d: 58, j: 79 },
    bollinger: { upper: 595, middle: 578, lower: 561 },
    volume: { avg_volume: 45000, current_volume: 48000, ratio: 1.07 },
  };

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
            <p className="text-sm text-gray-500">MA、RSI、MACD、KDJ、布林帶等多指標分析</p>
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            分析
          </button>
        </form>
      </div>

      {/* 評分摘要 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{selectedCode}</h2>
            <p className="text-sm text-gray-500">技術面綜合分析</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">{technicalResult.score}</div>
              <div className="text-xs text-gray-500">綜合評分</div>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${
              technicalResult.signal === "買入"
                ? "bg-green-100 text-green-700"
                : technicalResult.signal === "賣出"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {technicalResult.signal}
            </div>
          </div>
        </div>

        {/* 指標摘要 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">MA 排列</div>
            <div className="text-sm font-semibold text-gray-900">{technicalResult.ma_alignment}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">趨勢</div>
            <div className="text-sm font-semibold text-gray-900">
              {technicalResult.trend.direction} ({technicalResult.trend.strength}%)
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">RSI (14)</div>
            <div className="text-sm font-semibold text-gray-900">{technicalResult.rsi}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">量比</div>
            <div className="text-sm font-semibold text-gray-900">{technicalResult.volume.ratio.toFixed(2)}x</div>
          </div>
        </div>
      </div>

      {/* K 線圖 + MA */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">K 線圖 + 移動平均線</h3>
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={maData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Line type="monotone" dataKey="close" stroke="#1e293b" strokeWidth={2} dot={false} name="收盤價" />
              <Line type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MA5" />
              <Line type="monotone" dataKey="ma10" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="MA10" />
              <Line type="monotone" dataKey="ma20" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="MA20" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* RSI */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">RSI (相對強弱指標)</h3>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={rsiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="rsi" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MACD */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">MACD (指數平滑異同移動平均線)</h3>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={macdData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="histogram" fill="#3b82f6" name="MACD 柱狀圖" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 詳細指標數值 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">詳細指標數值</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">KDJ 指標</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">K 值</span>
                <span className="font-mono font-medium">{technicalResult.kdj.k}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">D 值</span>
                <span className="font-mono font-medium">{technicalResult.kdj.d}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">J 值</span>
                <span className="font-mono font-medium">{technicalResult.kdj.j}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">布林帶</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">上軌</span>
                <span className="font-mono font-medium text-red-600">{technicalResult.bollinger.upper}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">中軌</span>
                <span className="font-mono font-medium">{technicalResult.bollinger.middle}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">下軌</span>
                <span className="font-mono font-medium text-green-600">{technicalResult.bollinger.lower}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">量價分析</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">均量</span>
                <span className="font-mono font-medium">{technicalResult.volume.avg_volume.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">現量</span>
                <span className="font-mono font-medium">{technicalResult.volume.current_volume.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">量比</span>
                <span className="font-mono font-medium">{technicalResult.volume.ratio.toFixed(2)}x</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
