"use client";

import { Search, Activity, BarChart3, Brain, TrendingUp } from "lucide-react";
import { useState } from "react";
import RadarChartComponent from "@/components/decision/RadarChartComponent";
import ScoreBreakdownCard, { type ScoreBreakdown } from "@/components/decision/ScoreBreakdownCard";

interface RadarValues {
  value: number;
  momentum: number;
  chip: number;
  growth: number;
  resistance: number;
}

export default function DecisionPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");

  // 模擬評分數據
  const mockScores: Record<string, ScoreBreakdown & { total: number }> = {
    "2330": { technical: 80, chip: 85, fundamental: 90, sentiment: 75, total: 85 },
    "2454": { technical: 72, chip: 68, fundamental: 65, sentiment: 60, total: 68 },
    "3034": { technical: 65, chip: 70, fundamental: 72, sentiment: 68, total: 70 },
  };

  // 模擬雷達圖數據
  const mockRadar: Record<string, RadarValues> = {
    "2330": { value: 85, momentum: 78, chip: 85, growth: 90, resistance: 75 },
    "2454": { value: 65, momentum: 72, chip: 68, growth: 65, resistance: 60 },
    "3034": { value: 68, momentum: 65, chip: 70, growth: 72, resistance: 68 },
  };

  // 模擬決策樹訊號
  const mockSignals = {
    "2330": { level: "買入", action: "繼續持有", reason: "TSMC 目前處於強勢多頭格局，外資連續三週淨買入，技術面突破前高，建議繼續持有。短期壓力位 580，支撐位 560。" },
    "2454": { level: "觀察", action: "逢低佈局", reason: "聯電處於盤整階段，外資買超但量能不強。建議等待突破 42.5 頸線後再進場。" },
    "3034": { level: "買入", action: "適度加碼", reason: "封測需求增長明確，籌碼集中度提升，建議在 118-120 區間適度加碼。" },
  };

  const scores = mockScores[selectedCode] || mockScores["2330"];
  const radar = mockRadar[selectedCode] || mockRadar["2330"];
  const signal = mockSignals[selectedCode as keyof typeof mockSignals] || mockSignals["2330"];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  const signalColor = {
    "買入": { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
    "觀察": { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
    "賣出": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  };

  const signalConfig = signalColor[signal.level as keyof typeof signalColor] || signalColor["觀察"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">決策中心</h1>
          <p className="text-sm text-gray-500 mt-1">多因子評分、雷達圖、決策樹訊號</p>
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

      {/* 決策訊號 */}
      <div className={`rounded-xl border p-5 mb-6 ${signalConfig.bg} ${signalConfig.border}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${signalConfig.badge}`}>
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-bold text-gray-900">{selectedCode}</h2>
              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${signalConfig.badge}`}>
                {signal.level}
              </span>
              <span className="text-sm text-gray-600">→ {signal.action}</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{signal.reason}</p>
          </div>
        </div>
      </div>

      {/* 主要內容 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 min-w-0">
        <RadarChartComponent data={radar} stockCode={selectedCode} />
        <ScoreBreakdownCard
          scores={{
            technical: scores.technical,
            chip: scores.chip,
            fundamental: scores.fundamental,
            sentiment: scores.sentiment,
          }}
          totalScore={scores.total}
        />
      </div>

      {/* 各維度詳細分析 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">技術面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{scores.technical}</div>
          <p className="text-xs text-gray-500">MA 多頭排列，RSI 中性區間</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-900">籌碼面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{scores.chip}</div>
          <p className="text-xs text-gray-500">外資連買，籌碼集中度提升</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900">情緒面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{scores.sentiment}</div>
          <p className="text-xs text-gray-500">新聞情緒正面，市場信心充足</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-gray-900">基本面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">{scores.fundamental}</div>
          <p className="text-xs text-gray-500">營收成長穩定，獲利能力強</p>
        </div>
      </div>

      {/* 每日推薦 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mt-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">每日推薦</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">代碼</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">訊號</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">技術</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">籌碼</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">情緒</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">基本面</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">總分</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(mockScores).map(([code, data]) => {
                const sig = mockSignals[code as keyof typeof mockSignals];
                const config = signalColor[sig.level as keyof typeof signalColor] || signalColor["觀察"];
                return (
                  <tr
                    key={code}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      code === selectedCode ? "bg-blue-50" : ""
                    }`}
                    onClick={() => {
                      setSelectedCode(code);
                      setSearchCode(code);
                    }}
                  >
                    <td className="py-3 px-4 font-bold text-gray-900">{code}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.badge}`}>
                        {sig.level}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">{data.technical}</td>
                    <td className="py-3 px-4 text-center font-mono">{data.chip}</td>
                    <td className="py-3 px-4 text-center font-mono">{data.sentiment}</td>
                    <td className="py-3 px-4 text-center font-mono">{data.fundamental}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-600">{data.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
