"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search, BarChart3, AlertCircle, Loader2,
  ArrowUpRight, ArrowDownRight, Users, TrendingUp, TrendingDown,
} from "lucide-react";
import { useChipAnalysis, useStock } from "@/hooks/useApi";

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)} 億`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)} 萬`;
  return n.toLocaleString();
}

function NetBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 font-medium tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {pos ? "+" : ""}{fmt(value)}
    </span>
  );
}

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 65) return "text-green-400";
  if (s >= 50) return "text-yellow-400";
  if (s >= 35) return "text-orange-400";
  return "text-red-400";
}

function TrendBadge({ trend }: { trend: string }) {
  const isUp = trend?.includes("買") || trend?.includes("上");
  const isDown = trend?.includes("賣") || trend?.includes("下");
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
      isUp ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
      : isDown ? "text-red-400 bg-red-400/10 border-red-400/20"
      : "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
    }`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : null}
      {trend}
    </span>
  );
}

function ChipContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";
  const [inputCode, setInputCode] = useState(code);

  const { data, isLoading, error } = useChipAnalysis(code);
  const { data: stock } = useStock(code);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = inputCode.trim().toUpperCase();
    if (v) router.push(`/chip?code=${v}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-emerald-400" />
          籌碼分析
        </h1>
        <p className="text-slate-400 text-sm">法人動向、融資融券、籌碼集中度追蹤</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="輸入股票代碼 (如 2330)"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors">
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
          無法取得 {code} 的籌碼分析資料，請確認股票代碼或確認資料庫已初始化
        </div>
      )}

      {!code && !isLoading && (
        <div className="text-center py-24">
          <BarChart3 className="w-12 h-12 text-slate-800 mx-auto mb-4" />
          <p className="text-slate-500">請輸入股票代碼以開始籌碼分析</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {stock && (
            <div className="mb-6 flex items-center gap-3">
              <span className="text-white font-semibold text-lg">{stock.name}</span>
              <span className="text-slate-500 text-sm">{code}</span>
              <span className={`text-sm font-semibold px-3 py-0.5 rounded-full border bg-slate-800 border-slate-700 ${scoreColor(data.score)}`}>
                籌碼評分 {data.score}
              </span>
              <TrendBadge trend={data.signal} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Dealer Flow */}
            <div className="lg:col-span-2 p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-2 mb-5">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-white">三大法人動向</span>
                <TrendBadge trend={data.dealer_flow.trend} />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "外資", value: data.dealer_flow.foreign_net_buy, days: data.dealer_flow.foreign_consecutive_days },
                  { label: "投信", value: data.dealer_flow.invest_trust_net_buy, days: data.dealer_flow.invest_trust_consecutive_days },
                  { label: "自營商", value: data.dealer_flow.proprietary_net_buy, days: null },
                ].map(({ label, value, days }) => (
                  <div key={label} className="p-3 bg-slate-800 rounded-xl text-center">
                    <div className="text-xs text-slate-400 mb-1">{label}</div>
                    <NetBadge value={value} />
                    {days !== null && (
                      <div className={`text-xs mt-1 ${days > 0 ? "text-emerald-400/70" : days < 0 ? "text-red-400/70" : "text-slate-500"}`}>
                        {days > 0 ? `連買 ${days} 日` : days < 0 ? `連賣 ${Math.abs(days)} 日` : "中性"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">法人訊號</span>
                  <TrendBadge trend={data.dealer_flow.signal} />
                </div>
              </div>
            </div>

            {/* Margin Trading */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-sm font-medium text-white mb-5">融資融券</div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">融資餘額</span>
                    <span className="text-white tabular-nums">{fmt(data.margin_trading.margin_balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>淨買</span>
                    <NetBadge value={data.margin_trading.margin_net_buy} />
                  </div>
                  <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, data.margin_trading.margin_ratio * 100)}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">融資比率 {(data.margin_trading.margin_ratio * 100).toFixed(1)}%</div>
                </div>
                <div className="border-t border-slate-800 pt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">融券餘額</span>
                    <span className="text-white tabular-nums">{fmt(data.margin_trading.short_balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>淨賣</span>
                    <NetBadge value={-data.margin_trading.short_net_sell} />
                  </div>
                </div>
                <div className="border-t border-slate-800 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">融資趨勢</span>
                    <TrendBadge trend={data.margin_trading.margin_trend} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">融券趨勢</span>
                    <TrendBadge trend={data.margin_trading.short_trend} />
                  </div>
                </div>
              </div>
            </div>

            {/* Concentration */}
            <div className="lg:col-span-3 p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-sm font-medium text-white mb-5">籌碼集中度</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-slate-400">大戶籌碼集中度</div>
                  <div className="text-2xl font-bold text-white">
                    {(data.concentration.concentration_ratio * 100).toFixed(1)}%
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.concentration.concentration_ratio * 100}%` }} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-slate-400">散戶持股比例</div>
                  <div className="text-2xl font-bold text-white">
                    {(data.concentration.retail_ratio * 100).toFixed(1)}%
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${data.concentration.retail_ratio * 100}%` }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">大戶趨勢</span>
                    <TrendBadge trend={data.concentration.large_holder_trend} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">集中度訊號</span>
                    <TrendBadge trend={data.concentration.signal} />
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

export default function ChipPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />載入中...
        </div>
      }
    >
      <ChipContent />
    </Suspense>
  );
}
