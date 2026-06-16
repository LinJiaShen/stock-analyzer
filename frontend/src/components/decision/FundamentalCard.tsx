"use client";

import { useQuery } from "@tanstack/react-query";
import { Landmark, Info } from "lucide-react";
import { api } from "@/lib/api";

interface FundamentalHints {
  pe: string | null;
  pb: string | null;
  dividend_yield: string | null;
  roe: string | null;
}

interface Fundamentals {
  stock_code: string;
  available: boolean;
  updated_at?: string;
  pe_ratio?: number | null;
  forward_pe?: number | null;
  pb_ratio?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
  roe?: number | null;
  market_cap?: number | null;
  hints?: FundamentalHints;
}

const fmtMarketCap = (v?: number | null) => {
  if (v == null) return "--";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} 兆`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(0)} 億`;
  return v.toLocaleString();
};

function Metric({
  label,
  value,
  suffix = "",
  hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string | null;
}) {
  return (
    <div className="p-3 rounded-lg border border-gray-200">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-lg font-bold font-mono text-gray-800">
        {value}
        {value !== "--" && suffix ? <span className="text-xs font-normal text-gray-400 ml-0.5">{suffix}</span> : null}
      </div>
      {hint && <div className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

export default function FundamentalCard({ stockCode }: { stockCode: string }) {
  const { data, isLoading } = useQuery<Fundamentals>({
    queryKey: ["fundamentals", stockCode],
    queryFn: async () => (await api.get(`/api/stocks/${stockCode}/fundamentals`)).data,
    retry: false,
    staleTime: 1000 * 60 * 60, // 1h，基本面變動慢
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="w-4 h-4 text-indigo-500" />
        <h3 className="text-base font-semibold text-gray-900">基本面快照</h3>
        <span className="text-[11px] text-gray-400">估值與獲利能力</span>
      </div>

      {isLoading ? (
        <div className="animate-pulse grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
        </div>
      ) : !data || !data.available ? (
        <p className="text-sm text-gray-400">查無此檔基本面資料（可能為 ETF 或新上市/興櫃股）</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Metric label="本益比 PE" value={data.pe_ratio != null ? data.pe_ratio.toFixed(1) : "--"} suffix="倍" hint={data.hints?.pe} />
            <Metric label="預估本益比" value={data.forward_pe != null ? data.forward_pe.toFixed(1) : "--"} suffix="倍" />
            <Metric label="本淨比 PB" value={data.pb_ratio != null ? data.pb_ratio.toFixed(1) : "--"} suffix="倍" hint={data.hints?.pb} />
            <Metric label="每股盈餘 EPS" value={data.eps != null ? data.eps.toFixed(2) : "--"} suffix="元" />
            <Metric label="殖利率" value={data.dividend_yield != null ? data.dividend_yield.toFixed(2) : "--"} suffix="%" hint={data.hints?.dividend_yield} />
            <Metric label="ROE" value={data.roe != null ? data.roe.toFixed(1) : "--"} suffix="%" hint={data.hints?.roe} />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <span>市值 {fmtMarketCap(data.market_cap)}</span>
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              來源 Yahoo Finance，每日更新
            </span>
          </div>
        </>
      )}
    </div>
  );
}
