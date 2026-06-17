"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import api from "@/lib/api";

interface RevPoint {
  month: string;
  revenue: number | null;
  yoy_pct: number | null;
  mom_pct: number | null;
  cum_yoy_pct: number | null;
}

const fmtYi = (v: number | null) => (v == null ? "--" : `${(v / 100000).toFixed(1)} 億`); // 千元 → 億
const pct = (v: number | null | undefined) => (v == null ? "--" : `${v > 0 ? "+" : ""}${v}%`);
const yoyColor = (v: number | null | undefined) =>
  v == null ? "text-gray-500" : v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "text-gray-600";

export default function MonthlyRevenueCard({ stockCode }: { stockCode: string }) {
  const { data } = useQuery<{ series: RevPoint[]; latest: RevPoint | null }>({
    queryKey: ["revenue", stockCode],
    queryFn: async () => (await api.get(`/api/stocks/${stockCode}/revenue?months=18`)).data,
    retry: false,
  });
  const series = data?.series ?? [];
  const latest = data?.latest ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-gray-900">月營收</h3>
        {latest && <span className="text-xs text-gray-400 ml-auto">{latest.month}</span>}
      </div>
      <p className="text-xs text-gray-400 mb-3">台股最重要的領先指標（每月 10 號公布）</p>

      {!latest ? (
        <div className="py-8 text-center text-sm text-gray-400">尚無月營收資料</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-[11px] text-gray-500 mb-0.5">當月營收</div>
              <div className="text-lg font-bold font-mono text-gray-900">{fmtYi(latest.revenue)}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-0.5">年增 YoY</div>
              <div className={`text-lg font-bold font-mono ${yoyColor(latest.yoy_pct)}`}>{pct(latest.yoy_pct)}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-0.5">月增 MoM</div>
              <div className={`text-lg font-bold font-mono ${yoyColor(latest.mom_pct)}`}>{pct(latest.mom_pct)}</div>
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mb-1">近 {series.length} 月 YoY 走勢</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} />
              <Tooltip formatter={(v) => [`${v}%`, "YoY"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="yoy_pct" radius={[2, 2, 0, 0]}>
                {series.map((d, i) => (
                  <Cell key={i} fill={(d.yoy_pct ?? 0) >= 0 ? "#dc2626" : "#16a34a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {latest.cum_yoy_pct != null && (
            <div className="mt-2 text-xs text-gray-500">
              累計年增 <span className={`font-mono font-medium ${yoyColor(latest.cum_yoy_pct)}`}>{pct(latest.cum_yoy_pct)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
