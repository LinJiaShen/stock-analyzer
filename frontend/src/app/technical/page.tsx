"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search, TrendingUp, TrendingDown, Minus,
  AlertCircle, Loader2,
} from "lucide-react";
import { useTechnicalAnalysis, useStock } from "@/hooks/useApi";

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 65) return "text-green-400";
  if (s >= 50) return "text-yellow-400";
  if (s >= 35) return "text-orange-400";
  return "text-red-400";
}

function scoreLabel(s: number) {
  if (s >= 80) return "強勢";
  if (s >= 65) return "偏多";
  if (s >= 50) return "中性";
  if (s >= 35) return "偏空";
  return "弱勢";
}

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const stroke =
    score >= 80 ? "#34d399" : score >= 65 ? "#4ade80" : score >= 50 ? "#facc15" : score >= 35 ? "#fb923c" : "#f87171";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
        <div className="text-xs text-slate-500">/ 100</div>
      </div>
    </div>
  );
}

function MiniBar({ value, min = 0, max = 100, label, color }: {
  value: number; min?: number; max?: number; label: string; color: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={color}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color.replace("text-", "").includes("emerald") ? "#34d399" : color.includes("orange") ? "#fb923c" : color.includes("purple") ? "#c084fc" : "#60a5fa" }} />
      </div>
    </div>
  );
}

function TechnicalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";
  const [inputCode, setInputCode] = useState(code);

  const { data, isLoading, error } = useTechnicalAnalysis(code);
  const { data: stock } = useStock(code);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = inputCode.trim().toUpperCase();
    if (v) router.push(`/technical?code=${v}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-400" />
          技術分析
        </h1>
        <p className="text-slate-400 text-sm">MA、RSI、MACD、KDJ、布林帶多指標分析</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="輸入股票代碼 (如 2330)"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-sm font-medium transition-colors">
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
          無法取得 {code} 的技術分析資料，請確認股票代碼或確認資料庫已初始化
        </div>
      )}

      {!code && !isLoading && (
        <div className="text-center py-24">
          <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
          <p className="text-slate-500">請輸入股票代碼以開始技術分析</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {stock && (
            <div className="mb-6">
              <span className="text-white font-semibold text-lg">{stock.name}</span>
              <span className="text-slate-500 ml-2 text-sm">{code}</span>
              {stock.industry && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {stock.industry}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Score */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900 flex flex-col items-center gap-4">
              <ScoreRing score={data.score} />
              <div className="text-center">
                <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${scoreColor(data.score)} bg-slate-800 border-slate-700`}>
                  {scoreLabel(data.score)}
                </span>
                <div className="text-slate-500 text-xs mt-2">技術面評分</div>
              </div>
              <div className="w-full pt-4 border-t border-slate-800 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">訊號</span>
                  <span className={data.signal?.includes("多") || data.signal?.includes("漲") ? "text-emerald-400" : data.signal?.includes("空") || data.signal?.includes("跌") ? "text-red-400" : "text-yellow-400"}>
                    {data.signal}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">均線排列</span>
                  <span className="text-white text-xs">{data.ma_alignment}</span>
                </div>
              </div>
            </div>

            {/* Indicators */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Trend */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                  {data.trend.direction?.includes("上升")
                    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                    : data.trend.direction?.includes("下降")
                    ? <TrendingDown className="w-4 h-4 text-red-400" />
                    : <Minus className="w-4 h-4 text-yellow-400" />}
                  <span className="text-sm font-medium text-white">趨勢</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">方向</span>
                    <span className={data.trend.direction?.includes("上升") ? "text-emerald-400 font-medium" : data.trend.direction?.includes("下降") ? "text-red-400 font-medium" : "text-yellow-400 font-medium"}>
                      {data.trend.direction}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">強度</span>
                      <span className="text-white">{(data.trend.strength * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.trend.strength * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* RSI */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="text-sm font-medium text-white mb-4">RSI (14)</div>
                <div className="text-3xl font-bold mb-1" style={{ color: data.rsi >= 70 ? "#f87171" : data.rsi <= 30 ? "#34d399" : "#f8fafc" }}>
                  {data.rsi.toFixed(1)}
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full" style={{ width: `${data.rsi}%`, backgroundColor: data.rsi >= 70 ? "#f87171" : data.rsi <= 30 ? "#34d399" : "#60a5fa" }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-400/60">超賣 30</span>
                  <span className={data.rsi >= 70 ? "text-red-400 font-medium" : data.rsi <= 30 ? "text-emerald-400 font-medium" : "text-slate-400"}>
                    {data.rsi >= 70 ? "超買區間" : data.rsi <= 30 ? "超賣區間" : "正常區間"}
                  </span>
                  <span className="text-red-400/60">超買 70</span>
                </div>
              </div>

              {/* MACD */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="text-sm font-medium text-white mb-4">MACD</div>
                <div className="space-y-2.5">
                  {[
                    { label: "MACD 線", v: data.macd.macd_line },
                    { label: "訊號線", v: data.macd.signal_line },
                    { label: "柱狀圖", v: data.macd.histogram },
                  ].map(({ label, v }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-slate-400">{label}</span>
                      <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {v >= 0 ? "+" : ""}{v.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* KDJ */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="text-sm font-medium text-white mb-4">KDJ</div>
                <div className="space-y-2">
                  <MiniBar value={data.kdj.k} label="K" color="text-blue-400" />
                  <MiniBar value={data.kdj.d} label="D" color="text-orange-400" />
                  <MiniBar value={Math.max(0, Math.min(100, data.kdj.j))} label="J" color="text-purple-400" />
                </div>
              </div>

              {/* Bollinger */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl sm:col-span-2">
                <div className="text-sm font-medium text-white mb-4">布林帶 (Bollinger Bands)</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-slate-800 rounded-xl">
                    <div className="text-red-400 font-semibold tabular-nums">{data.bollinger.upper.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">上軌</div>
                  </div>
                  <div className="text-center p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="text-blue-400 font-semibold tabular-nums">{data.bollinger.middle.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">中軌 (MA20)</div>
                  </div>
                  <div className="text-center p-3 bg-slate-800 rounded-xl">
                    <div className="text-emerald-400 font-semibold tabular-nums">{data.bollinger.lower.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">下軌</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TechnicalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />載入中...
        </div>
      }
    >
      <TechnicalContent />
    </Suspense>
  );
}
