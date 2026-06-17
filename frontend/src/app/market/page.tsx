"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, TrendingUp, TrendingDown, Layers } from "lucide-react";
import api from "@/lib/api";

interface IndexInfo {
  value: number; change_pct: number | null;
  ma20: number | null; ma60: number | null; ma120: number | null;
  vs_ma20: string | null; vs_ma60: string | null; vs_ma120: string | null;
  above_count: number; stage: string;
}
interface Institutional { date: string; foreign_net: number; trust_net: number; proprietary_net: number; total: number; }
interface Breadth { date: string; up: number; down: number; flat: number; }
interface IndRet { industry: string; return: number; }
interface Overview {
  index: IndexInfo | null; institutional: Institutional | null; breadth: Breadth | null;
  hot_industries: IndRet[]; cold_industries: IndRet[]; market_avg_return: number | null;
}

const up = (v: number | null | undefined) => (v == null ? "text-gray-500" : v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "text-gray-600");
const lots = (v: number) => (Math.abs(v) >= 10000 ? `${v > 0 ? "+" : ""}${(v / 10000).toFixed(1)} 萬張` : `${v > 0 ? "+" : ""}${v} 張`);
const stageColor = (n: number) => (n >= 3 ? "bg-red-100 text-red-700" : n === 2 ? "bg-orange-100 text-orange-700" : n === 1 ? "bg-lime-100 text-lime-700" : "bg-green-100 text-green-700");

export default function MarketPage() {
  const { data } = useQuery<Overview>({
    queryKey: ["market-overview"],
    queryFn: async () => (await api.get("/api/market/overview")).data,
    retry: false,
    refetchInterval: 5 * 60 * 1000,
  });
  const idx = data?.index;
  const inst = data?.institutional;
  const breadth = data?.breadth;

  const maChip = (label: string, ma: number | null, vs: string | null) => (
    <div className={`px-2.5 py-1.5 rounded-lg text-center ${vs === "above" ? "bg-red-50" : vs === "below" ? "bg-green-50" : "bg-gray-50"}`}>
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs font-mono font-bold text-gray-800">{ma != null ? ma.toLocaleString() : "--"}</div>
      <div className={`text-[10px] font-medium ${vs === "above" ? "text-red-600" : vs === "below" ? "text-green-600" : "text-gray-400"}`}>
        {vs === "above" ? "站上" : vs === "below" ? "跌破" : "--"}
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">大盤位階</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">由上而下看市場：加權指數位階、三大法人現貨動向、市場寬度、產業輪動。</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* 加權指數位階 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">加權指數位階</h2>
            {idx && <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${stageColor(idx.above_count)}`}>{idx.stage}</span>}
          </div>
          {!idx ? (
            <div className="py-8 text-center text-sm text-gray-400">指數資料載入中…</div>
          ) : (
            <>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-bold font-mono text-gray-900">{idx.value.toLocaleString()}</span>
                <span className={`text-base font-mono font-medium ${up(idx.change_pct)}`}>
                  {(idx.change_pct ?? 0) > 0 ? "+" : ""}{idx.change_pct}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {maChip("月線 MA20", idx.ma20, idx.vs_ma20)}
                {maChip("季線 MA60", idx.ma60, idx.vs_ma60)}
                {maChip("半年線 MA120", idx.ma120, idx.vs_ma120)}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">站上 {idx.above_count}/3 條均線</p>
            </>
          )}
        </div>

        {/* 三大法人現貨總買賣超 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">三大法人現貨總買賣超</h2>
            {inst && <span className="text-[11px] text-gray-400">{inst.date}</span>}
          </div>
          {!inst ? (
            <div className="py-8 text-center text-sm text-gray-400">尚無籌碼資料</div>
          ) : (
            <>
              <div className={`text-3xl font-bold font-mono mb-3 ${up(inst.total)}`}>{lots(inst.total)}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([["外資", inst.foreign_net], ["投信", inst.trust_net], ["自營商", inst.proprietary_net]] as const).map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-gray-100 p-2">
                    <div className="text-[11px] text-gray-500">{l}</div>
                    <div className={`text-sm font-mono font-bold ${up(v)}`}>{lots(v)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 市場寬度 */}
      {breadth && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">市場寬度（{breadth.date}）</h2>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex h-6 rounded-lg overflow-hidden bg-gray-100">
              <div className="bg-red-500 h-full" style={{ width: `${(breadth.up / Math.max(1, breadth.up + breadth.down + breadth.flat)) * 100}%` }} />
              <div className="bg-green-500 h-full" style={{ width: `${(breadth.down / Math.max(1, breadth.up + breadth.down + breadth.flat)) * 100}%` }} />
            </div>
            <div className="text-sm font-mono whitespace-nowrap">
              <span className="text-red-600 font-bold">{breadth.up} 漲</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-green-600 font-bold">{breadth.down} 跌</span>
              {breadth.flat > 0 && <span className="text-gray-400 ml-1">/ {breadth.flat} 平</span>}
            </div>
          </div>
        </div>
      )}

      {/* 產業輪動 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-red-500" />熱門族群（近 30 日）</h2>
          {(data?.hot_industries ?? []).length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">資料不足</div>
          ) : (
            <div className="space-y-1.5">
              {data!.hot_industries.map((r) => (
                <div key={r.industry} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-gray-300" />{r.industry}</span>
                  <span className="font-mono font-bold text-red-600">+{r.return}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-green-500" />冷門族群（近 30 日）</h2>
          {(data?.cold_industries ?? []).length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">資料不足</div>
          ) : (
            <div className="space-y-1.5">
              {data!.cold_industries.map((r) => (
                <div key={r.industry} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-gray-300" />{r.industry}</span>
                  <span className={`font-mono font-bold ${up(r.return)}`}>{r.return > 0 ? "+" : ""}{r.return}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {data?.market_avg_return != null && (
        <p className="text-[11px] text-gray-400 mt-3 text-center">全市場近 30 日平均報酬 {data.market_avg_return > 0 ? "+" : ""}{data.market_avg_return}%</p>
      )}
    </div>
  );
}
