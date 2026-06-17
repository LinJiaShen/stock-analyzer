"use client";

import { useState, useEffect } from "react";
import { FlaskConical, Plus, Trash2, X, CheckCircle2, Sparkles, RefreshCw, Wallet, Pencil, Calculator, AlertTriangle, Settings, LineChart, Info } from "lucide-react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ExitRecord {
  type: "tp" | "sl" | "manual";
  seq: number;
  price: number;
  quantity: number;
  filled_time?: string;
  filled_price?: number;
}

interface DecisionSnapshot {
  total?: number;
  technical?: number;
  chip?: number;
  fundamental?: number;
  sentiment?: number;
  pattern?: number;
  atr_14?: number | null;
  rr_ratio?: number;
  target?: number;
  stop_loss?: number;
  confidence?: string;
  health?: string;
  entry?: number;
  decided_at?: string;
}

interface PaperTrade {
  id: string;
  strategy: string | null;
  stock_code: string;
  stock_name: string | null;
  entry_time: string;
  entry_price: number;
  quantity: number;
  exits: ExitRecord[];
  status: "open" | "partial" | "closed" | "proposed";
  remaining_quantity: number;
  latest_price: number | null;
  realized_pnl: number;
  realized_pnl_pct: number;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  total_pnl: number;
  total_pnl_pct: number;
  total_cost: number;
  decision_snapshot?: DecisionSnapshot | null;
}

interface Stats {
  total_trades: number;
  open_trades: number;
  closed_trades: number;
  proposed_trades: number;
  win_rate: number;
  rr_ratio: number | null;
  ev: number;
  total_cost: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  // 帳戶本金面
  initial_capital: number;
  available_cash: number;
  deployed: number;
  equity: number;
  return_pct: number;
  peak_equity: number;
  drawdown_pct: number;
  // P1 進階績效
  profit_factor: number | null;
  max_consecutive_losses: number;
  avg_hold_days: number | null;
  largest_win: number;
  largest_loss: number;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown_pct: number | null;
  equity_curve: { date: string; equity: number }[];
}

interface Settings {
  auto_trade_mode: "off" | "semi" | "auto";
  fee_discount: number;
  risk_per_trade_pct: number;
  max_position_pct: number;
  max_total_exposure_pct: number;
  daily_loss_limit_pct: number;
  max_consecutive_losses: number;
  max_positions: number;
  initial_capital: number;
}

const MODE_LABELS: Record<string, { label: string; cls: string }> = {
  off: { label: "手動（AI 不自動下單）", cls: "bg-slate-700 text-slate-200" },
  semi: { label: "半自動（AI 出單・人確認）", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
  auto: { label: "全自動（全權交給 AI）", cls: "bg-violet-500/20 text-violet-200 border border-violet-500/40" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open: { label: "持倉中", cls: "bg-blue-100 text-blue-700" },
  partial: { label: "部分平倉", cls: "bg-yellow-100 text-yellow-700" },
  closed: { label: "已平倉", cls: "bg-gray-100 text-gray-600" },
  proposed: { label: "AI 建議", cls: "bg-violet-100 text-violet-700" },
};

const pnlColor = (v: number | null | undefined) => {
  if (v == null || v === 0) return "text-gray-500";
  return v > 0 ? "text-red-600" : "text-green-600"; // 台股紅漲綠跌
};

const fmtMoney = (v: number | null | undefined) => {
  if (v == null) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}$${Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0)}`;
};

// 大額金額以「萬」為單位顯示（本金、餘額、權益）
const fmtTwd = (v: number | null | undefined) => {
  if (v == null) return "--";
  if (Math.abs(v) >= 10000) return `$${(v / 10000).toFixed(1)} 萬`;
  return `$${v.toFixed(0)}`;
};

interface PrefillExit { type: string; seq: number; price: number; quantity: number; }
interface TradePrefill { stock_code?: string; entry_price?: number; quantity?: number; exits?: PrefillExit[]; }

export default function PaperTradingPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCapital, setShowCapital] = useState(false);
  const [fillTarget, setFillTarget] = useState<PaperTrade | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<PaperTrade | null>(null);
  const [prefill, setPrefill] = useState<TradePrefill | null>(null);

  // 由技術頁「以此開模擬單」帶入的劇本（sessionStorage 交接）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("paper_prefill");
      if (raw) {
        setPrefill(JSON.parse(raw));
        setShowCreate(true);
        sessionStorage.removeItem("paper_prefill");
      }
    } catch { /* ignore malformed prefill */ }
  }, []);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["paper-stats"],
    queryFn: async () => (await api.get("/api/paper-trades/stats")).data,
    retry: false,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["paper-settings"],
    queryFn: async () => (await api.get("/api/paper-trades/settings")).data,
    retry: false,
  });

  const { data, isLoading, isError } = useQuery<{ trades: PaperTrade[]; total: number }>({
    queryKey: ["paper-trades", statusFilter],
    queryFn: async () => (await api.get("/api/paper-trades/", { params: { status: statusFilter } })).data,
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["paper-trades"] });
    queryClient.invalidateQueries({ queryKey: ["paper-stats"] });
    queryClient.invalidateQueries({ queryKey: ["paper-settings"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/paper-trades/${id}`),
    onSuccess: invalidate,
  });

  // 半自動：確認 AI 建議單（proposed → open）
  const confirmMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/api/paper-trades/${id}/confirm`),
    onSuccess: invalidate,
  });

  // AI 自動選股開倉
  const [aiResult, setAiResult] = useState<string | null>(null);
  const autoPickMutation = useMutation({
    mutationFn: async () => (await api.post("/api/paper-trades/auto-pick", {}, { timeout: 300000 })).data,
    onSuccess: (data: any) => {
      invalidate();
      if (data.opened?.length > 0) {
        setAiResult(`AI 開倉 ${data.opened.length} 筆：${data.opened.map((o: any) => `${o.code} ${o.name}（評分 ${o.score}）`).join("、")}`);
      } else {
        setAiResult(data.message ?? "目前沒有符合策略條件的標的");
      }
    },
    onError: () => setAiResult("AI 選股失敗，請稍後再試"),
  });

  // 手動觸發 TP/SL 檢查
  const checkTriggersMutation = useMutation({
    mutationFn: async () => (await api.post("/api/paper-trades/check-triggers", {}, { timeout: 120000 })).data,
    onSuccess: (data: any) => {
      invalidate();
      if (data.filled?.length > 0) {
        setAiResult(`觸發成交 ${data.filled.length} 筆：${data.filled.map((f: any) => `${f.code} ${f.type.toUpperCase()} @${f.price}（${f.pnl >= 0 ? "+" : ""}${f.pnl}）`).join("、")}`);
      } else {
        setAiResult(`已檢查 ${data.checked} 筆持倉，無觸發（取得 ${data.prices} 檔現價）`);
      }
    },
  });

  // 深色頁首帶用的損益配色（暗底亮字）
  const darkPnl = (v: number | null | undefined) => {
    if (v == null || v === 0) return "text-white";
    return v > 0 ? "text-red-400" : "text-green-400";
  };

  const statCards = [
    { label: "勝率", value: stats ? `${stats.win_rate.toFixed(1)}%` : "--", color: "text-white" },
    { label: "平均盈虧比", value: stats?.rr_ratio != null ? stats.rr_ratio.toFixed(2) : "--", color: "text-white" },
    { label: "EV", value: stats ? fmtMoney(stats.ev) : "--", color: darkPnl(stats?.ev) },
    { label: "總投入成本", value: stats ? `$${(stats.total_cost / 1000).toFixed(0)}K` : "--", color: "text-white" },
    { label: "已實現損益", value: stats ? fmtMoney(stats.realized_pnl) : "--", color: darkPnl(stats?.realized_pnl) },
    { label: "總損益（含未實現）", value: stats ? fmtMoney(stats.total_pnl) : "--", color: darkPnl(stats?.total_pnl) },
    { label: "獲利因子", value: stats?.profit_factor != null ? stats.profit_factor.toFixed(2) : "--", color: "text-white" },
    { label: "最大連敗", value: stats ? `${stats.max_consecutive_losses} 次` : "--", color: "text-white" },
    { label: "平均持有", value: stats?.avg_hold_days != null ? `${stats.avg_hold_days} 天` : "--", color: "text-white" },
    { label: "夏普值", value: stats?.sharpe != null ? stats.sharpe.toFixed(2) : "--", color: "text-white" },
    { label: "Sortino", value: stats?.sortino != null ? stats.sortino.toFixed(2) : "--", color: "text-white" },
  ];

  return (
    <div>
      {/* 深色頁首帶：標題 + 統計數據（Graphcue 式） */}
      <section className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
          <div className="flex items-end justify-between gap-5 mb-6">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-indigo-400 mb-2">
                Paper Trading
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">模擬交易</h1>
              <p className="text-[13px] text-slate-400 mt-1.5">
                用虛擬資金驗證進出場計畫，建立紀律再投入真金
              </p>
              <button
                onClick={() => setShowSettings(true)}
                className={`mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors ${MODE_LABELS[settings?.auto_trade_mode ?? "off"].cls}`}
                title="點擊調整自動交易模式"
              >
                <Sparkles className="w-3 h-3" />
                自動交易：{MODE_LABELS[settings?.auto_trade_mode ?? "off"].label}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/paper/backtest"
                className="flex items-center gap-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
              >
                <LineChart className="w-4 h-4" />
                回測
              </Link>
              <button
                onClick={() => setShowSettings(true)}
                title="自動交易模式、費率、風控設定"
                className="flex items-center gap-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                設定
              </button>
              <button
                onClick={() => checkTriggersMutation.mutate()}
                disabled={checkTriggersMutation.isPending}
                title="盤中每 5 分鐘自動檢查，也可手動觸發"
                className="flex items-center gap-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checkTriggersMutation.isPending ? "animate-spin" : ""}`} />
                檢查觸發
              </button>
              <button
                onClick={() => autoPickMutation.mutate()}
                disabled={autoPickMutation.isPending}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                <Sparkles className={`w-4 h-4 ${autoPickMutation.isPending ? "animate-pulse" : ""}`} />
                {autoPickMutation.isPending ? "AI 選股中..." : "AI 選股開倉"}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                新增模擬單
              </button>
            </div>
          </div>

          {/* AI 操作結果 */}
          {aiResult && (
            <div className="mb-4 px-3.5 py-2.5 bg-violet-500/10 border border-violet-500/30 rounded-lg text-[13px] text-violet-200">
              {aiResult}
            </div>
          )}

          {/* 本金帳戶帶：本金 / 可用餘額 / 總權益 / 報酬率 / 最大回撤 */}
          <div className="mb-4 rounded-xl bg-slate-800/50 border border-slate-700/60 px-4 py-3.5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-y-3 divide-x divide-slate-700/60">
              <div className="px-4 first:pl-0">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                  <Wallet className="w-3 h-3" />本金
                  <button
                    onClick={() => setShowCapital(true)}
                    className="text-indigo-400 hover:text-indigo-300"
                    title="設定本金"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-lg font-bold font-mono text-white">{stats ? fmtTwd(stats.initial_capital) : "--"}</div>
              </div>
              <div className="px-4">
                <div className="text-[11px] text-slate-500 mb-1">可用餘額</div>
                <div className={`text-lg font-bold font-mono ${stats && stats.available_cash < 0 ? "text-amber-400" : "text-white"}`}>
                  {stats ? fmtTwd(stats.available_cash) : "--"}
                </div>
                {stats && (
                  <div className="text-[10px] text-slate-500 mt-0.5">已投入 {fmtTwd(stats.deployed)}</div>
                )}
              </div>
              <div className="px-4">
                <div className="text-[11px] text-slate-500 mb-1">總權益</div>
                <div className="text-lg font-bold font-mono text-white">{stats ? fmtTwd(stats.equity) : "--"}</div>
              </div>
              <div className="px-4">
                <div className="text-[11px] text-slate-500 mb-1">報酬率</div>
                <div className={`text-lg font-bold font-mono ${darkPnl(stats?.return_pct)}`}>
                  {stats ? `${stats.return_pct > 0 ? "+" : ""}${stats.return_pct}%` : "--"}
                </div>
              </div>
              <div className="px-4">
                <div className="text-[11px] text-slate-500 mb-1">最大回撤</div>
                <div className={`text-lg font-bold font-mono ${stats && stats.drawdown_pct < 0 ? "text-green-400" : "text-white"}`}>
                  {stats ? `${stats.drawdown_pct}%` : "--"}
                </div>
              </div>
            </div>
          </div>

          {/* 統計帶（嵌在深色區） */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-slate-800 border-t border-slate-800">
            {statCards.map((c) => (
              <div key={c.label} className="pt-4 px-4 first:pl-0">
                <div className="text-[11px] text-slate-500 mb-1">{c.label}</div>
                <div className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 狀態篩選 */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "all", label: "全部" },
          { key: "open", label: "持倉中" },
          { key: "partial", label: "部分平倉" },
          { key: "closed", label: "已平倉" },
          { key: "proposed", label: "AI 建議" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.key ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 持倉表格 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">需要登入才能使用模擬交易</p>
            <Link href="/login" className="text-blue-500 text-sm hover:underline mt-2 block">前往登入</Link>
          </div>
        ) : isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : !data || data.trades.length === 0 ? (
          <div className="py-16 text-center">
            <FlaskConical className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">尚無模擬單</p>
            <p className="text-gray-300 text-xs mt-1">點擊「新增模擬單」建立第一筆測試交易</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-xs">
                  <th className="text-left py-2.5 px-4 font-medium">個股</th>
                  <th className="text-right py-2.5 px-3 font-medium">進場</th>
                  <th className="text-center py-2.5 px-3 font-medium">TP/SL 計畫</th>
                  <th className="text-center py-2.5 px-3 font-medium">狀態</th>
                  <th className="text-right py-2.5 px-3 font-medium">剩餘</th>
                  <th className="text-right py-2.5 px-3 font-medium">現價</th>
                  <th className="text-right py-2.5 px-3 font-medium">已實現</th>
                  <th className="text-right py-2.5 px-3 font-medium">未實現</th>
                  <th className="text-right py-2.5 px-3 font-medium">總損益</th>
                  <th className="py-2.5 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((t) => {
                  const st = STATUS_LABELS[t.status];
                  return (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Link href={`/stock/${t.stock_code}`} className="hover:text-blue-600">
                          <span className="font-bold text-gray-900">{t.stock_code}</span>
                          <span className="text-gray-500 ml-1.5 text-xs">{t.stock_name}</span>
                        </Link>
                        {t.strategy && (
                          <div className="text-[10px] text-purple-500 mt-0.5">{t.strategy}</div>
                        )}
                        {t.decision_snapshot && (
                          <button
                            onClick={() => setDecisionTarget(t)}
                            className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700"
                          >
                            <Info className="w-3 h-3" />決策依據
                          </button>
                        )}
                      </td>
                      <td className="text-right py-3 px-3">
                        <div className="font-mono">{t.entry_price.toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(t.entry_time).toLocaleDateString("zh-TW")} · {t.quantity}張
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1 justify-center flex-wrap max-w-[180px]">
                          {(t.exits || []).map((e, i) => (
                            <span
                              key={i}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                e.filled_time
                                  ? "bg-gray-200 text-gray-500 line-through"
                                  : e.type === "tp"
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : e.type === "sl"
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-gray-50 text-gray-600"
                              }`}
                              title={e.filled_time ? `已成交 @${e.filled_price}` : "未觸發"}
                            >
                              {e.type.toUpperCase()}{e.seq > 0 ? e.seq : ""} {e.price}×{e.quantity}
                            </span>
                          ))}
                          {(!t.exits || t.exits.length === 0) && (
                            <span className="text-[10px] text-gray-300">無計畫</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="text-right py-3 px-3 font-mono">{t.remaining_quantity}張</td>
                      <td className="text-right py-3 px-3 font-mono">{t.latest_price?.toFixed(2) ?? "--"}</td>
                      <td className={`text-right py-3 px-3 font-mono ${pnlColor(t.realized_pnl)}`}>
                        {t.realized_pnl !== 0 ? (
                          <>
                            <div>{fmtMoney(t.realized_pnl)}</div>
                            <div className="text-[10px]">{t.realized_pnl_pct > 0 ? "+" : ""}{t.realized_pnl_pct}%</div>
                          </>
                        ) : "--"}
                      </td>
                      <td className={`text-right py-3 px-3 font-mono ${pnlColor(t.unrealized_pnl)}`}>
                        {t.unrealized_pnl != null ? (
                          <>
                            <div>{fmtMoney(t.unrealized_pnl)}</div>
                            <div className="text-[10px]">{(t.unrealized_pnl_pct ?? 0) > 0 ? "+" : ""}{t.unrealized_pnl_pct}%</div>
                          </>
                        ) : "--"}
                      </td>
                      <td className={`text-right py-3 px-3 font-mono font-bold ${pnlColor(t.total_pnl)}`}>
                        <div>{fmtMoney(t.total_pnl)}</div>
                        <div className="text-[10px] font-normal">{t.total_pnl_pct > 0 ? "+" : ""}{t.total_pnl_pct}%</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1">
                          {t.status === "proposed" ? (
                            <button
                              onClick={() => confirmMutation.mutate(t.id)}
                              className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"
                              title="確認開倉（AI 建議 → 持倉）"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          ) : t.status !== "closed" ? (
                            <button
                              onClick={() => setFillTarget(t)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                              title="記錄出場"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          ) : null}
                          <button
                            onClick={() => deleteMutation.mutate(t.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            title={t.status === "proposed" ? "拒絕此建議" : "刪除"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          initialCapital={stats?.initial_capital ?? null}
          availableCash={stats?.available_cash ?? null}
          initial={prefill}
          onClose={() => { setShowCreate(false); setPrefill(null); invalidate(); }}
        />
      )}
      {showCapital && (
        <CapitalModal
          current={stats?.initial_capital ?? null}
          onClose={() => { setShowCapital(false); invalidate(); }}
        />
      )}
      {fillTarget && <FillModal trade={fillTarget} onClose={() => { setFillTarget(null); invalidate(); }} />}
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); invalidate(); }} />}
      {decisionTarget && <DecisionModal trade={decisionTarget} onClose={() => setDecisionTarget(null)} />}
      </div>
    </div>
  );
}

// ---------- 新增模擬單 Modal ----------

function CreateModal({
  initialCapital,
  availableCash,
  initial,
  onClose,
}: {
  initialCapital: number | null;
  availableCash: number | null;
  initial?: TradePrefill | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => {
    const tp = initial?.exits?.find((e) => e.type === "tp" && e.seq === 1);
    const sl = initial?.exits?.find((e) => e.type === "sl");
    return {
      stock_code: initial?.stock_code ?? "", stock_name: "", strategy: initial ? "技術劇本" : "",
      entry_price: initial?.entry_price != null ? String(initial.entry_price) : "",
      quantity: initial?.quantity != null ? String(initial.quantity) : "1",
      tp1_price: tp ? String(tp.price) : "", tp1_qty: tp ? String(tp.quantity) : "",
      sl1_price: sl ? String(sl.price) : "", sl1_qty: sl ? String(sl.quantity) : "",
    };
  });
  const [riskPct, setRiskPct] = useState("2"); // 部位計算器：每筆風險占本金 %
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const SHARES = 1000;
  const entry = Number(form.entry_price) || 0;
  const qty = Number(form.quantity) || 0;
  const sl = Number(form.sl1_price) || 0;

  // 即時風險試算
  const cost = entry * qty * SHARES;
  const pctOfCapital = initialCapital && cost > 0 ? (cost / initialCapital) * 100 : null;
  const hasValidSl = sl > 0 && sl < entry;
  const slQty = Number(form.sl1_qty) || qty; // SL 張數未填則視為全部
  const maxLoss = hasValidSl ? (entry - sl) * slQty * SHARES : null;
  const maxLossPct = maxLoss != null && initialCapital ? (maxLoss / initialCapital) * 100 : null;
  const overBalance = availableCash != null && cost > availableCash;

  // 部位計算器：依風險% 反推建議張數 = 本金 × 風險% ÷ (進場−停損) ÷ 1000
  const riskBudget = initialCapital ? initialCapital * (Number(riskPct) / 100) : 0;
  const suggestedQty =
    hasValidSl && riskBudget > 0 ? Math.floor(riskBudget / ((entry - sl) * SHARES)) : 0;

  const handleSubmit = async () => {
    setError("");
    if (!form.stock_code || !form.entry_price) { setError("請填寫股票代碼與進場價"); return; }
    if (!form.sl1_price) { setError("請設定停損價（SL）— 模擬交易強制停損，幫你建立進場前先想退場的紀律"); return; }
    if (sl >= entry) { setError("停損價需低於進場價"); return; }
    const exits: any[] = [];
    if (form.tp1_price && form.tp1_qty) exits.push({ type: "tp", seq: 1, price: Number(form.tp1_price), quantity: Number(form.tp1_qty) });
    exits.push({ type: "sl", seq: 1, price: sl, quantity: slQty });
    setSubmitting(true);
    try {
      await api.post("/api/paper-trades/", {
        stock_code: form.stock_code.trim(),
        stock_name: form.stock_name.trim() || null,
        strategy: form.strategy.trim() || null,
        entry_price: entry,
        quantity: qty,
        exits,
      });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "建立失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder = "", type = "text") => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type={type} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">新增模擬單</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          {field("股票代碼 *", "stock_code", "2330")}
          {field("股票名稱", "stock_name", "台積電")}
          {field("進場價 *", "entry_price", "580.0", "number")}
          {field("張數 *", "quantity", "1", "number")}
          {field("策略標籤", "strategy", "中期極波動")}
          <div />
          {field("TP1 停利價", "tp1_price", "選填", "number")}
          {field("TP1 張數", "tp1_qty", "選填", "number")}
          {field("SL1 停損價 *", "sl1_price", "必填", "number")}
          {field("SL1 張數", "sl1_qty", "預設全部", "number")}
        </div>

        {/* 部位計算器：依可承受風險反推建議張數 */}
        {initialCapital != null && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-2">
              <Calculator className="w-3.5 h-3.5" />部位計算器
              <span className="font-normal text-indigo-400">— 先想好「最多賠多少」，再決定買幾張</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">每筆最多賠本金的</span>
              <input
                type="number" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                className="w-16 border border-indigo-300 rounded-lg px-2 py-1 text-sm text-center"
              />
              <span className="text-gray-600">%</span>
              {hasValidSl ? (
                <span className="ml-auto text-gray-700">
                  建議 <b className="text-indigo-700">{suggestedQty} 張</b>
                  {suggestedQty > 0 && (
                    <button
                      onClick={() => setForm((f) => ({ ...f, quantity: String(suggestedQty), sl1_qty: String(suggestedQty) }))}
                      className="ml-2 text-xs px-2 py-0.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >套用</button>
                  )}
                </span>
              ) : (
                <span className="ml-auto text-[11px] text-gray-400">填進場價與停損價後計算</span>
              )}
            </div>
          </div>
        )}

        {/* 即時風險摘要：占本金 / 最大虧損（顯示不強制） */}
        {(pctOfCapital != null || maxLossPct != null) && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-[11px] text-gray-500 mb-0.5">這筆佔本金</div>
              <div className={`text-lg font-bold font-mono ${pctOfCapital != null && pctOfCapital > 30 ? "text-amber-600" : "text-gray-800"}`}>
                {pctOfCapital != null ? `${pctOfCapital.toFixed(1)}%` : "--"}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">成本 {cost > 0 ? fmtTwd(cost) : "--"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-[11px] text-gray-500 mb-0.5">觸發停損最大虧損</div>
              <div className={`text-lg font-bold font-mono ${maxLossPct != null && maxLossPct > 5 ? "text-red-600" : "text-gray-800"}`}>
                {maxLossPct != null ? `−${maxLossPct.toFixed(1)}%` : "--"}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{maxLoss != null ? `約 −${fmtTwd(maxLoss).replace("$", "$")}` : "需填停損價"}</div>
            </div>
          </div>
        )}

        {/* 餘額超限警示（前端提示，後端亦強制） */}
        {overBalance && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>進場成本 {fmtTwd(cost)} 超過可用餘額 {fmtTwd(availableCash)}，將無法開倉。請降低張數或調高本金。</span>
          </div>
        )}

        <button
          onClick={handleSubmit} disabled={submitting || overBalance}
          className="w-full mt-5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors"
        >
          {submitting ? "建立中..." : overBalance ? "超過可用餘額" : "建立模擬單"}
        </button>
      </div>
    </div>
  );
}

// ---------- 設定本金 Modal ----------

function CapitalModal({ current, onClose }: { current: number | null; onClose: () => void }) {
  const [value, setValue] = useState(current ? String(current) : "1000000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const presets = [500000, 1000000, 3000000, 5000000];

  const handleSubmit = async () => {
    setError("");
    const capital = Number(value);
    if (!capital || capital <= 0) { setError("請輸入有效的本金金額"); return; }
    setSubmitting(true);
    try {
      await api.put("/api/paper-trades/account", { initial_capital: capital });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "設定失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-600" />設定模擬本金
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>}
        <p className="text-xs text-gray-500 mb-3">
          設定一筆虛擬本金，模擬真實資金的部位配置與風險控管。開倉成本不可超過可用餘額。
        </p>
        <div className="flex gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p} onClick={() => setValue(String(p))}
              className={`flex-1 py-1.5 rounded-lg text-xs border transition-colors ${
                Number(value) === p ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {p / 10000} 萬
            </button>
          ))}
        </div>
        <input
          type="number" value={value} onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleSubmit} disabled={submitting}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-2.5 rounded-xl transition-colors"
        >
          {submitting ? "儲存中..." : "儲存本金"}
        </button>
      </div>
    </div>
  );
}

// ---------- 記錄出場 Modal ----------

function FillModal({ trade, onClose }: { trade: PaperTrade; onClose: () => void }) {
  const [type, setType] = useState<"tp" | "sl" | "manual">("manual");
  const [seq, setSeq] = useState(1);
  const [price, setPrice] = useState(trade.latest_price?.toString() ?? "");
  const [qty, setQty] = useState(trade.remaining_quantity.toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!price || !qty) { setError("請填寫成交價與張數"); return; }
    setSubmitting(true);
    try {
      await api.post(`/api/paper-trades/${trade.id}/fill`, {
        type, seq, filled_price: Number(price), quantity: Number(qty),
      });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "記錄失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">記錄出場 — {trade.stock_code}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">出場類型</label>
            <div className="flex gap-2">
              {([["manual", "手動平倉"], ["tp", "停利 TP"], ["sl", "停損 SL"]] as const).map(([k, label]) => (
                <button
                  key={k} onClick={() => setType(k)}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    type === k ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {type !== "manual" && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">序號（TP1-3 / SL1-2）</label>
              <select value={seq} onChange={(e) => setSeq(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">成交價</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">張數（剩餘 {trade.remaining_quantity}）</label>
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <button
          onClick={handleSubmit} disabled={submitting}
          className="w-full mt-5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium py-2.5 rounded-xl transition-colors"
        >
          {submitting ? "記錄中..." : "確認出場"}
        </button>
      </div>
    </div>
  );
}

// ---------- 自動交易設定 Modal ----------

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: s } = useQuery<Settings>({
    queryKey: ["paper-settings"],
    queryFn: async () => (await api.get("/api/paper-trades/settings")).data,
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-violet-600" />自動交易設定
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {!s ? (
          <div className="py-12 text-center">
            <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <SettingsForm initial={s} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function SettingsForm({ initial, onClose }: { initial: Settings; onClose: () => void }) {
  const [mode, setMode] = useState<"off" | "semi" | "auto">(initial.auto_trade_mode);
  const [form, setForm] = useState({
    fee_discount: String(initial.fee_discount),
    risk_per_trade_pct: String(initial.risk_per_trade_pct),
    max_position_pct: String(initial.max_position_pct),
    max_total_exposure_pct: String(initial.max_total_exposure_pct),
    daily_loss_limit_pct: String(initial.daily_loss_limit_pct),
    max_consecutive_losses: String(initial.max_consecutive_losses),
    max_positions: String(initial.max_positions),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const MODES: { key: "off" | "semi" | "auto"; title: string; desc: string }[] = [
    { key: "off", title: "手動", desc: "AI 不自動下單，由你自己建立模擬單。" },
    { key: "semi", title: "半自動", desc: "AI 每日選股出「建議單」，等你按「確認」才進場。" },
    { key: "auto", title: "全自動", desc: "全權交給 AI：每交易日 09:15 自動選股、依風控自動進出場。" },
  ];

  const numField = (label: string, key: keyof typeof form, suffix = "") => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number" value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        {suffix && <span className="text-xs text-gray-400 w-4">{suffix}</span>}
      </div>
    </div>
  );

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await api.put("/api/paper-trades/settings", {
        auto_trade_mode: mode,
        fee_discount: Number(form.fee_discount),
        risk_per_trade_pct: Number(form.risk_per_trade_pct),
        max_position_pct: Number(form.max_position_pct),
        max_total_exposure_pct: Number(form.max_total_exposure_pct),
        daily_loss_limit_pct: Number(form.daily_loss_limit_pct),
        max_consecutive_losses: Number(form.max_consecutive_losses),
        max_positions: Number(form.max_positions),
      });
      onClose();
    } catch (e) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "儲存失敗");
      setSubmitting(false);
    }
  };

  return (
    <>
      {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>}

      <div className="mb-2 text-xs font-semibold text-gray-700">交易模式</div>
      <div className="grid grid-cols-3 gap-2 mb-1">
        {MODES.map((m) => (
          <button
            key={m.key} onClick={() => setMode(m.key)}
            className={`p-2.5 rounded-xl border text-center transition-colors ${mode === m.key ? "border-violet-500 bg-violet-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <div className={`text-sm font-bold ${mode === m.key ? "text-violet-700" : "text-gray-700"}`}>{m.title}</div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mb-4 min-h-[28px]">{MODES.find((m) => m.key === mode)?.desc}</p>
      {mode === "auto" && (
        <div className="mb-4 flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>全自動會自動進出場。建議先用「回測」與「半自動」確認策略表現，再開啟。</span>
        </div>
      )}

      <div className="mb-2 text-xs font-semibold text-gray-700">風控與成本</div>
      <div className="grid grid-cols-2 gap-3">
        {numField("券商手續費折數", "fee_discount", "×")}
        {numField("每筆風險占本金", "risk_per_trade_pct", "%")}
        {numField("單一持股上限", "max_position_pct", "%")}
        {numField("總曝險上限", "max_total_exposure_pct", "%")}
        {numField("每日虧損熔斷", "daily_loss_limit_pct", "%")}
        {numField("連敗暫停門檻", "max_consecutive_losses", "次")}
        {numField("最多同時持倉", "max_positions", "檔")}
      </div>

      <button
        onClick={handleSubmit} disabled={submitting}
        className="w-full mt-5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-medium py-2.5 rounded-xl transition-colors"
      >
        {submitting ? "儲存中..." : "儲存設定"}
      </button>
    </>
  );
}

// ---------- AI 決策依據 Modal ----------

function DecisionModal({ trade, onClose }: { trade: PaperTrade; onClose: () => void }) {
  const d = trade.decision_snapshot ?? {};
  const fmt = (v?: number | null) => (v == null ? "--" : String(v));
  const scoreRows: [string, number | undefined][] = [
    ["綜合評分", d.total],
    ["技術面", d.technical],
    ["籌碼面", d.chip],
    ["基本面", d.fundamental],
    ["情緒面", d.sentiment],
    ["K 線形態", d.pattern],
  ];
  const params: [string, string][] = [
    ["進場", fmt(d.entry)],
    ["停損", fmt(d.stop_loss)],
    ["目標", fmt(d.target)],
    ["風報比", d.rr_ratio != null ? `1:${d.rr_ratio}` : "--"],
    ["ATR", fmt(d.atr_14)],
    ["信度", d.confidence ?? "--"],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />決策依據
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {trade.stock_code} {trade.stock_name ?? ""}
          {d.decided_at ? ` · AI 於 ${new Date(d.decided_at).toLocaleString("zh-TW")} 開倉` : ""}
        </p>

        <div className="text-xs font-semibold text-gray-700 mb-2">進場評分快照</div>
        <div className="space-y-1.5 mb-4">
          {scoreRows.map(([label, val]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16 flex-shrink-0">{label}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500" style={{ width: `${Math.max(0, Math.min(100, val ?? 0))}%` }} />
              </div>
              <span className="text-xs font-mono text-gray-700 w-9 text-right">{fmt(val)}</span>
            </div>
          ))}
        </div>

        <div className="text-xs font-semibold text-gray-700 mb-2">操作參數</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {params.map(([label, val]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-2">
              <div className="text-[10px] text-gray-400">{label}</div>
              <div className="text-sm font-mono font-bold text-gray-800">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
