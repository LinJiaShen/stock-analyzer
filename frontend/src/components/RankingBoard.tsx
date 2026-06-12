"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface RankItem {
  code: string;
  name: string;
  close: number;
  change_percent: number | null;
  volume_lots: number;
  amount_billion: number | null;
}

const TABS = [
  { key: "change", label: "漲幅" },
  { key: "change_desc", label: "跌幅" },
  { key: "volume", label: "量" },
  { key: "amount", label: "額" },
] as const;

const pctColor = (v: number | null) => {
  if (v == null || v === 0) return "text-gray-500";
  return v > 0 ? "text-red-600" : "text-green-600";
};

export default function RankingBoard({ limit = 20, compact = false }: { limit?: number; compact?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("change");

  const { data, isLoading } = useQuery<{ trade_date: string; items: RankItem[] }>({
    queryKey: ["rankings", tab, limit],
    queryFn: async () => (await api.get("/api/stocks/rankings", { params: { by: tab, limit }, timeout: 60000 })).data,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h3 className="text-base font-semibold text-gray-900">排行榜</h3>
          {data?.trade_date && (
            <span className="text-[10px] text-gray-400">{data.trade_date}・全市場</span>
          )}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 pb-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse h-8 bg-gray-50 rounded" />
          ))}
        </div>
      ) : (
        <div className={compact ? "max-h-96 overflow-y-auto" : ""}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-400 border-y border-gray-100 bg-gray-50/50">
                <th className="text-left py-1.5 pl-4 font-medium w-8">#</th>
                <th className="text-left py-1.5 font-medium">個股</th>
                <th className="text-right py-1.5 font-medium">成交價</th>
                <th className="text-right py-1.5 font-medium">漲跌%</th>
                <th className="text-right py-1.5 pr-4 font-medium">
                  {tab === "amount" ? "成交額" : "成交量"}
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item, i) => (
                <tr key={item.code} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                  <td className={`py-2 pl-4 font-mono text-xs ${i < 3 ? "text-amber-500 font-bold" : "text-gray-400"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2">
                    <Link href={`/stock/${item.code}`} className="hover:text-blue-600">
                      <span className="font-bold text-gray-900">{item.code}</span>
                      <span className="text-gray-500 text-xs ml-1.5">{item.name}</span>
                    </Link>
                  </td>
                  <td className="text-right py-2 font-mono text-gray-900">
                    {item.close.toLocaleString()}
                  </td>
                  <td className={`text-right py-2 font-mono font-medium ${pctColor(item.change_percent)}`}>
                    {item.change_percent != null
                      ? `${item.change_percent > 0 ? "+" : ""}${item.change_percent}%`
                      : "--"}
                  </td>
                  <td className="text-right py-2 pr-4 font-mono text-xs text-gray-600">
                    {tab === "amount"
                      ? item.amount_billion != null ? `${item.amount_billion}億` : "--"
                      : item.volume_lots >= 10000
                      ? `${(item.volume_lots / 10000).toFixed(1)}萬張`
                      : `${item.volume_lots.toLocaleString()}張`}
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                    暫無資料（需先有兩個交易日的全市場行情）
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
