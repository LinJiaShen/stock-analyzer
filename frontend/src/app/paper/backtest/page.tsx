"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, TrendingUp, AlertTriangle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";

interface Metrics {
  total_return_pct: number;
  cagr_pct: number | null;
  max_drawdown_pct: number;
  win_rate: number;
  profit_factor: number | null;
  num_trades: number;
  avg_hold_days: number | null;
  sharpe: number | null;
  final_equity: number;
  initial_capital: number;
}
interface RunResult {
  id: string;
  label: string | null;
  metrics: Metrics;
  equity_curve: { date: string; equity: number }[];
  trades?: number;
}
interface RunSummary {
  id: string;
  label: string | null;
  metrics: Metrics;
  created_at: string;
}

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const fmtTwd = (v: number | null | undefined) => {
  if (v == null) return "--";
  if (Math.abs(v) >= 10000) return `$${(v / 10000).toFixed(1)} 萬`;
  return `$${v.toFixed(0)}`;
};
const pnlColor = (v: number | null | undefined) =>
  v == null ? "text-gray-500" : v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "text-gray-700";

export default function BacktestPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    start: isoDaysAgo(730),
    end: isoDaysAgo(0),
    stock_codes: "",
    initial_capital: "1000000",
    risk_per_trade_pct: "2",
    fee_discount: "1.0",
    max_positions: "5",
    atr_pct_min: "2.5",
    atr_pct_max: "9",
    rsi_min: "35",
    rsi_max: "75",
    label: "",
  });
  const [result, setResult] = useState<RunResult | null>(null);

  const { data: runsData } = useQuery<{ runs: RunSummary[] }>({
    queryKey: ["backtest-runs"],
    queryFn: async () => (await api.get("/api/backtest/runs")).data,
    retry: false,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const codes = form.stock_codes.split(/[,，\s]+/).map((c) => c.trim()).filter(Boolean);
      const payload = {
        start: form.start,
        end: form.end,
        stock_codes: codes.length ? codes : null,
        initial_capital: Number(form.initial_capital),
        risk_per_trade_pct: Number(form.risk_per_trade_pct),
        fee_discount: Number(form.fee_discount),
        max_positions: Number(form.max_positions),
        atr_pct_min: Number(form.atr_pct_min),
        atr_pct_max: Number(form.atr_pct_max),
        rsi_min: Number(form.rsi_min),
        rsi_max: Number(form.rsi_max),
        label: form.label.trim() || null,
      };
      return (await api.post("/api/backtest/run", payload, { timeout: 300000 })).data as RunResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["backtest-runs"] });
    },
  });

  const loadRun = async (id: string) => {
    const data = (await api.get(`/api/backtest/runs/${id}`)).data as RunResult;
    setResult(data);
  };

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type={type} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  );

  const m = result?.metrics;
  const metricCards = m
    ? [
        { label: "總報酬", value: `${m.total_return_pct > 0 ? "+" : ""}${m.total_return_pct}%`, color: pnlColor(m.total_return_pct) },
        { label: "年化 (CAGR)", value: m.cagr_pct != null ? `${m.cagr_pct}%` : "--", color: pnlColor(m.cagr_pct) },
        { label: "最大回撤", value: `${m.max_drawdown_pct}%`, color: "text-green-600" },
        { label: "夏普值", value: m.sharpe != null ? m.sharpe.toFixed(2) : "--", color: "text-gray-800" },
        { label: "勝率", value: `${m.win_rate}%`, color: "text-gray-800" },
        { label: "獲利因子", value: m.profit_factor != null ? m.profit_factor.toFixed(2) : "--", color: "text-gray-800" },
        { label: "交易筆數", value: `${m.num_trades}`, color: "text-gray-800" },
        { label: "平均持有", value: m.avg_hold_days != null ? `${m.avg_hold_days} 天` : "--", color: "text-gray-800" },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Link href="/paper" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft className="w-4 h-4" />返回模擬交易
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-6 h-6 text-violet-600" />
        <h1 className="text-2xl font-bold text-gray-900">策略回測</h1>
      </div>
      <p className="text-sm text-gray-500 mb-3">用歷史 K 線驗證技術面策略的歷史表現（含手續費 + 證交稅）。</p>
      <div className="mb-5 flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 max-w-3xl">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>回測僅涵蓋<b className="font-medium">技術面</b>（ATR / RSI / 突破 / 均線）—— 基本面與情緒面缺乏歷史資料，無法 point-in-time 重算。結果反映策略的技術核心，非線上完整評分。</span>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* 參數表單 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-fit">
          <div className="grid grid-cols-2 gap-3">
            {field("起始日", "start", "date")}
            {field("結束日", "end", "date")}
          </div>
          <div className="mt-3">
            <label className="text-xs text-gray-500 mb-1 block">標的（逗號分隔，留空＝預設大型股池）</label>
            <input
              value={form.stock_codes} placeholder="2330, 2317, 2454"
              onChange={(e) => setForm((f) => ({ ...f, stock_codes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {field("本金", "initial_capital", "number")}
            {field("每筆風險 %", "risk_per_trade_pct", "number")}
            {field("手續費折數", "fee_discount", "number")}
            {field("最多持倉", "max_positions", "number")}
            {field("ATR% 下限", "atr_pct_min", "number")}
            {field("ATR% 上限", "atr_pct_max", "number")}
            {field("RSI 下限", "rsi_min", "number")}
            {field("RSI 上限", "rsi_max", "number")}
          </div>
          <div className="mt-3">{field("標籤（選填）", "label", "text", "如：中波動突破 2 年")}</div>

          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="w-full mt-4 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-medium py-2.5 rounded-xl transition-colors"
          >
            <Play className={`w-4 h-4 ${runMutation.isPending ? "animate-pulse" : ""}`} />
            {runMutation.isPending ? "回測中..." : "執行回測"}
          </button>
          {runMutation.isError && (
            <p className="mt-2 text-xs text-red-600">
              {(runMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "回測失敗（可能需要登入或標的無足夠歷史資料）"}
            </p>
          )}

          {/* 近期回測 */}
          {runsData?.runs && runsData.runs.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-700 mb-2">近期回測</div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {runsData.runs.map((r) => (
                  <button
                    key={r.id} onClick={() => loadRun(r.id)}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 border border-gray-100"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700 truncate">{r.label || "未命名"}</span>
                      <span className={`text-xs font-mono ${pnlColor(r.metrics?.total_return_pct)}`}>
                        {(r.metrics?.total_return_pct ?? 0) > 0 ? "+" : ""}{r.metrics?.total_return_pct ?? "--"}%
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleString("zh-TW")}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 結果 */}
        <div>
          {!result ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-20 text-center text-gray-400 text-sm">
              設定參數後點「執行回測」，這裡會顯示權益曲線與績效指標
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {metricCards.map((c) => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5">
                    <div className="text-[11px] text-gray-500 mb-1">{c.label}</div>
                    <div className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-700">權益曲線</div>
                  <div className="text-xs text-gray-400">
                    本金 {fmtTwd(m?.initial_capital)} → 期末 <span className={pnlColor(m ? m.final_equity - m.initial_capital : 0)}>{fmtTwd(m?.final_equity)}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={result.equity_curve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
                    <YAxis
                      tick={{ fontSize: 11 }} width={56}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => `${(v / 10000).toFixed(0)}萬`}
                    />
                    <Tooltip
                      formatter={(value) => [fmtTwd(Number(value)), "權益"]}
                      labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }}
                    />
                    {m && <ReferenceLine y={m.initial_capital} stroke="#cbd5e1" strokeDasharray="4 4" />}
                    <Line type="monotone" dataKey="equity" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
