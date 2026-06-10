"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Activity, AlertCircle, Loader2, Zap } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from "recharts";
import { useScore, useRadar, useSignals, useStock } from "@/hooks/useApi";

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 65) return "text-green-400";
  if (s >= 50) return "text-yellow-400";
  if (s >= 35) return "text-orange-400";
  return "text-red-400";
}
function scoreBgBorder(s: number) {
  if (s >= 80) return "border-emerald-500/30 bg-emerald-500/5";
  if (s >= 65) return "border-green-500/30 bg-green-500/5";
  if (s >= 50) return "border-yellow-500/30 bg-yellow-500/5";
  if (s >= 35) return "border-orange-500/30 bg-orange-500/5";
  return "border-red-500/30 bg-red-500/5";
}
function healthLabel(s: number) {
  if (s >= 80) return "強勢";
  if (s >= 65) return "偏多";
  if (s >= 50) return "中性";
  if (s >= 35) return "偏空";
  return "弱勢";
}

function BigScore({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const stroke = score >= 80 ? "#34d399" : score >= 65 ? "#4ade80" : score >= 50 ? "#facc15" : score >= 35 ? "#fb923c" : "#f87171";
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute text-center">
        <div className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</div>
        <div className="text-xs text-slate-500">/ 100</div>
      </div>
    </div>
  );
}

function ScoreDimension({ label, score, weight, color }: { label: string; score: number; weight: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">權重 {(weight * 100).toFixed(0)}%</span>
          <span className={`font-semibold ${color}`}>{score}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{
          width: `${score}%`,
          backgroundColor: score >= 80 ? "#34d399" : score >= 65 ? "#4ade80" : score >= 50 ? "#facc15" : score >= 35 ? "#fb923c" : "#f87171"
        }} />
      </div>
    </div>
  );
}

function SignalBadge({ level }: { level: string }) {
  const cfg =
    level?.includes("強") ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" :
    level?.includes("看多") || level?.includes("買") ? "text-green-400 bg-green-400/10 border-green-400/20" :
    level?.includes("看空") || level?.includes("賣") ? "text-red-400 bg-red-400/10 border-red-400/20" :
    "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg}`}>{level}</span>;
}

function DecisionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";
  const [inputCode, setInputCode] = useState(code);

  const { data: scoreData, isLoading: scoreLoading, error: scoreError } = useScore(code);
  const { data: radarData } = useRadar(code);
  const { data: signals } = useSignals(code);
  const { data: stock } = useStock(code);

  const isLoading = scoreLoading;
  const error = scoreError;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = inputCode.trim().toUpperCase();
    if (v) router.push(`/decision?code=${v}`);
  }

  const chartData = radarData
    ? [
        { subject: "技術面", value: Math.round(radarData.radar.value * 100) },
        { subject: "動能", value: Math.round(radarData.radar.momentum * 100) },
        { subject: "籌碼", value: Math.round(radarData.radar.chip * 100) },
        { subject: "成長", value: Math.round(radarData.radar.growth * 100) },
        { subject: "抗跌", value: Math.round(radarData.radar.resistance * 100) },
      ]
    : null;

  const stockSignals = signals?.filter((s) => !code || s.stock_code === code) ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Activity className="w-6 h-6 text-orange-400" />
          決策中心
        </h1>
        <p className="text-slate-400 text-sm">多因子評分、雷達圖、決策樹訊號</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="輸入股票代碼 (如 2330)"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-sm font-medium transition-colors">
          查詢
        </button>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />分析中...
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          無法取得 {code} 的決策分析資料，請確認股票代碼或確認資料庫已初始化
        </div>
      )}

      {!code && !isLoading && (
        <div className="text-center py-24">
          <Activity className="w-12 h-12 text-slate-800 mx-auto mb-4" />
          <p className="text-slate-500">請輸入股票代碼以開始決策分析</p>
        </div>
      )}

      {scoreData && !isLoading && (
        <>
          {stock && (
            <div className="mb-6 flex items-center gap-3">
              <span className="text-white font-semibold text-lg">{stock.name}</span>
              <span className="text-slate-500 text-sm">{code}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            {/* Total Score */}
            <div className={`p-6 rounded-2xl border ${scoreBgBorder(scoreData.total_score)} flex flex-col items-center gap-4`}>
              <BigScore score={scoreData.total_score} />
              <div className="text-center">
                <span className={`text-sm font-semibold px-3 py-1 rounded-full border bg-slate-900 border-slate-700 ${scoreColor(scoreData.total_score)}`}>
                  {healthLabel(scoreData.total_score)}
                </span>
                <div className="text-slate-500 text-xs mt-2">綜合決策評分</div>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-sm font-medium text-white mb-5">各維度評分</div>
              <div className="space-y-4">
                {[
                  { label: "技術面", score: scoreData.technical_score, weight: scoreData.weights?.technical ?? 0.3 },
                  { label: "籌碼面", score: scoreData.chip_score, weight: scoreData.weights?.chip ?? 0.3 },
                  { label: "基本面", score: scoreData.fundamental_score, weight: scoreData.weights?.fundamental ?? 0.2 },
                  { label: "情緒面", score: scoreData.sentiment_score, weight: scoreData.weights?.sentiment ?? 0.2 },
                ].map((d) => (
                  <ScoreDimension key={d.label} {...d} color={scoreColor(d.score)} />
                ))}
              </div>
            </div>

            {/* Radar Chart */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-sm font-medium text-white mb-2">雷達圖分析</div>
              {chartData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={chartData} outerRadius={70}>
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Radar
                      name="評分"
                      dataKey="value"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-slate-600 text-sm">
                  雷達圖資料不可用
                </div>
              )}
            </div>
          </div>

          {/* Signals */}
          {stockSignals.length > 0 && (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-white">決策樹訊號</span>
              </div>
              <div className="space-y-3">
                {stockSignals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-slate-800 rounded-xl">
                    <SignalBadge level={sig.level} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{sig.action}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{sig.reason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">綜合</div>
                      <div className={`text-sm font-semibold ${scoreColor(sig.scores.total)}`}>{sig.scores.total}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DecisionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />載入中...
        </div>
      }
    >
      <DecisionContent />
    </Suspense>
  );
}
