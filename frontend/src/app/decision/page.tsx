"use client";

import { Search, Activity, BarChart3, Brain, TrendingUp, Loader2 } from "lucide-react";
import { useState } from "react";
import RadarChartComponent from "@/components/decision/RadarChartComponent";
import ScoreBreakdownCard from "@/components/decision/ScoreBreakdownCard";
import OperationGuideCard from "@/components/decision/OperationGuideCard";
import FundamentalCard from "@/components/decision/FundamentalCard";
import AIAnalysisCard from "@/components/decision/AIAnalysisCard";
import PageHeader from "@/components/PageHeader";
import { useScore, useRadar, useSignals } from "@/hooks/useApi";

const ACTION_LABELS: Record<string, string> = {
  strong_buy: "積極買入",
  buy: "買入",
  caution: "謹慎觀望",
  watch: "持續觀察",
  sell: "建議賣出",
  strong_sell: "強力賣出",
};

const LEVEL_COLORS = {
  strong: { bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-700", label: "買入" },
  watch:  { bg: "bg-yellow-50", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-700", label: "觀察" },
  sell:   { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", label: "賣出" },
};
const DEFAULT_LEVEL = { bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-100 text-gray-500", label: "分析中" };

const FALLBACK_RADAR = { value: 0, momentum: 0, chip: 0, growth: 0, resistance: 0 };

export default function DecisionPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");

  const { data: scoreData, isLoading: scoreLoading } = useScore(selectedCode);
  const { data: radarData, isLoading: radarLoading } = useRadar(selectedCode);
  const { data: signalList, isLoading: signalLoading } = useSignals(selectedCode);

  const signal = signalList?.[0];
  const levelConfig = LEVEL_COLORS[signal?.level as keyof typeof LEVEL_COLORS] ?? DEFAULT_LEVEL;
  const isLoading = scoreLoading || radarLoading || signalLoading;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Decision Center"
        title="決策中心"
        description="多因子評分、AI 解讀、雷達圖與決策樹訊號 — 一頁看懂該不該出手"
      >
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="輸入股票代碼（例：2330）"
              className="pl-10 pr-4 py-2 w-52 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium"
          >
            分析
          </button>
        </form>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 決策訊號 */}
      {isLoading ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          <span className="text-sm text-gray-500">分析中，請稍候...</span>
        </div>
      ) : signal ? (
        <div className={`rounded-xl border p-5 mb-6 ${levelConfig.bg} ${levelConfig.border}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${levelConfig.badge}`}>
              <Activity className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-bold text-gray-900">{selectedCode}</h2>
                <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${levelConfig.badge}`}>
                  {levelConfig.label}
                </span>
                <span className="text-sm text-gray-600">→ {ACTION_LABELS[signal.action] ?? signal.action}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{signal.reason}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">
              {selectedCode} — 目前無明確訊號，市場處於觀望區間
            </span>
          </div>
        </div>
      )}

      {/* 主要內容 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 min-w-0">
        <RadarChartComponent
          data={radarData?.radar ?? FALLBACK_RADAR}
          stockCode={selectedCode}
          loading={radarLoading}
        />
        <ScoreBreakdownCard
          scores={{
            technical: scoreData?.technical_score ?? 0,
            chip: scoreData?.chip_score ?? 0,
            fundamental: scoreData?.fundamental_score ?? 0,
            sentiment: scoreData?.sentiment_score ?? 0,
          }}
          totalScore={scoreData?.total_score ?? 0}
          loading={scoreLoading}
        />
      </div>

      {/* AI 分析 + 操作建議 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 min-w-0">
        <div className="lg:col-span-2">
          <AIAnalysisCard stockCode={selectedCode} />
        </div>
        <OperationGuideCard
          data={scoreData?.operation ?? null}
          confidence={scoreData?.confidence ?? null}
          loading={scoreLoading}
        />
      </div>

      {/* 各維度詳細分析 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">技術面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {scoreLoading ? "..." : (scoreData?.technical_score ?? "--")}
          </div>
          <div className="text-xs text-gray-400">權重 30%</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-900">籌碼面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {scoreLoading ? "..." : (scoreData?.chip_score ?? "--")}
          </div>
          <div className="text-xs text-gray-400">權重 30%</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900">情緒面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {scoreLoading ? "..." : (scoreData?.sentiment_score ?? "--")}
          </div>
          <div className="text-xs text-gray-400">權重 20%</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-gray-900">基本面</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {scoreLoading ? "..." : (scoreData?.fundamental_score ?? "--")}
          </div>
          <div className="text-xs text-gray-400">權重 20%</div>
        </div>
      </div>

      {/* 基本面快照（估值與獲利能力） */}
      {selectedCode && (
        <div className="mt-6">
          <FundamentalCard stockCode={selectedCode} />
        </div>
      )}

      {/* 當前分析結果 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mt-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">當前分析結果</h3>
          <span className="text-xs text-gray-400">搜尋其他代碼可切換分析對象</span>
        </div>
        {scoreLoading ? (
          <div className="h-12 flex items-center">
            <div className="animate-pulse h-4 bg-gray-100 rounded w-full" />
          </div>
        ) : scoreData ? (
          <div className="overflow-x-auto mt-4">
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
                <tr className="border-b border-gray-100 bg-blue-50">
                  <td className="py-3 px-4 font-bold text-gray-900">{selectedCode}</td>
                  <td className="py-3 px-4">
                    {signal ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${levelConfig.badge}`}>
                        {levelConfig.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">無訊號</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-mono">{scoreData.technical_score}</td>
                  <td className="py-3 px-4 text-center font-mono">{scoreData.chip_score}</td>
                  <td className="py-3 px-4 text-center font-mono">{scoreData.sentiment_score}</td>
                  <td className="py-3 px-4 text-center font-mono">{scoreData.fundamental_score}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-blue-600">
                    {scoreData.total_score}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-3">查無 {selectedCode} 的評分資料</p>
        )}
      </div>
      </div>
    </div>
  );
}
