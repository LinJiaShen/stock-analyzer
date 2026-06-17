"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Plus, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface AlertRule {
  id: string;
  stock_code: string;
  stock_name: string | null;
  rule_type: string;
  params: Record<string, number>;
  enabled: boolean;
  last_triggered_at: string | null;
}

type Field = { key: string; label: string; ph: string };
const RULE_META: Record<string, { label: string; fields: Field[]; desc: (p: Record<string, number | undefined>) => string }> = {
  price_above: { label: "價格突破", fields: [{ key: "threshold", label: "目標價", ph: "600" }], desc: (p) => `收盤突破 ${p.threshold ?? "?"} 元` },
  price_below: { label: "價格跌破", fields: [{ key: "threshold", label: "目標價", ph: "550" }], desc: (p) => `收盤跌破 ${p.threshold ?? "?"} 元` },
  breakout: { label: "N 日新高", fields: [{ key: "lookback", label: "回看日數", ph: "20" }], desc: (p) => `創 ${p.lookback ?? 20} 日新高` },
  volume_spike: { label: "爆量", fields: [{ key: "lookback", label: "均量日數", ph: "20" }, { key: "multiplier", label: "倍數", ph: "1.5" }], desc: (p) => `量 > ${p.multiplier ?? 1.5}× ${p.lookback ?? 20} 日均量` },
  ma_break_below: { label: "跌破均線", fields: [{ key: "ma", label: "均線日數", ph: "20" }], desc: (p) => `跌破 ${p.ma ?? 20} 日均線` },
  ma_break_above: { label: "站上均線", fields: [{ key: "ma", label: "均線日數", ph: "20" }], desc: (p) => `站上 ${p.ma ?? 20} 日均線` },
  foreign_streak: { label: "外資連買", fields: [{ key: "days", label: "連買天數", ph: "3" }], desc: (p) => `外資連買 ≥ ${p.days ?? 3} 天` },
};

export default function AlertsPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<keyof typeof RULE_META>("breakout");
  const [params, setParams] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [scanMsg, setScanMsg] = useState("");

  const { data, isError } = useQuery<{ rules: AlertRule[] }>({
    queryKey: ["alerts"],
    queryFn: async () => (await api.get("/api/alerts/")).data,
    retry: false,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["alerts"] });

  const createMut = useMutation({
    mutationFn: async () => {
      const p: Record<string, number> = {};
      for (const f of RULE_META[ruleType].fields) {
        const v = Number(params[f.key]);
        if (!Number.isNaN(v) && params[f.key] !== undefined && params[f.key] !== "") p[f.key] = v;
      }
      return api.post("/api/alerts/", { stock_code: code.trim(), stock_name: name.trim() || null, rule_type: ruleType, params: p });
    },
    onSuccess: () => { setCode(""); setName(""); setParams({}); setError(""); invalidate(); },
    onError: (e) => setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "建立失敗"),
  });
  const toggleMut = useMutation({ mutationFn: async (id: string) => api.put(`/api/alerts/${id}/toggle`), onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: async (id: string) => api.delete(`/api/alerts/${id}`), onSuccess: invalidate });
  const scanMut = useMutation({
    mutationFn: async () => (await api.post("/api/alerts/scan")).data,
    onSuccess: (d: { scanned: number; triggered: number }) => setScanMsg(`已掃描 ${d.scanned} 條規則，觸發 ${d.triggered} 則（看右上角鈴鐺）`),
  });

  const rules = data?.rules ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">自訂預警</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">設定條件，盤後自動掃描；觸發時推播到右上角通知鈴鐺。不必整天盯盤。</p>

      {/* 新增規則 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" />新增預警</h2>
        {error && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">股票代碼 *</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2330"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">名稱</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="台積電"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">條件</label>
            <select value={ruleType} onChange={(e) => { setRuleType(e.target.value as keyof typeof RULE_META); setParams({}); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {Object.entries(RULE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          {RULE_META[ruleType].fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              <input type="number" value={params[f.key] ?? ""} placeholder={f.ph}
                onChange={(e) => setParams((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          ))}
        </div>
        <button onClick={() => code.trim() ? createMut.mutate() : setError("請輸入股票代碼")} disabled={createMut.isPending}
          className="mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {createMut.isPending ? "建立中..." : "新增預警"}
        </button>
      </div>

      {/* 規則列表 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">我的預警（{rules.length}）</h2>
        <button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}
          className="flex items-center gap-1.5 border border-gray-300 hover:border-gray-400 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${scanMut.isPending ? "animate-spin" : ""}`} />立即掃描
        </button>
      </div>
      {scanMsg && <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">{scanMsg}</div>}

      {isError ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <p className="text-gray-400 text-sm">需要登入才能使用預警</p>
          <Link href="/login" className="text-blue-500 text-sm hover:underline mt-2 block">前往登入</Link>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">尚無預警規則，於上方新增第一條</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 ${r.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              <Link href={`/stock/${r.stock_code}`} className="flex-shrink-0">
                <div className="font-bold text-gray-900">{r.stock_code}</div>
                <div className="text-[11px] text-gray-400">{r.stock_name}</div>
              </Link>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 mr-2">{RULE_META[r.rule_type]?.label ?? r.rule_type}</span>
                <span className="text-sm text-gray-700">{RULE_META[r.rule_type]?.desc(r.params) ?? ""}</span>
                {r.last_triggered_at && (
                  <div className="text-[10px] text-amber-600 mt-0.5">上次觸發 {new Date(r.last_triggered_at).toLocaleString("zh-TW")}</div>
                )}
              </div>
              <button onClick={() => toggleMut.mutate(r.id)} title={r.enabled ? "停用" : "啟用"}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg flex-shrink-0 ${r.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {r.enabled ? "啟用中" : "已停用"}
              </button>
              <button onClick={() => deleteMut.mutate(r.id)} title="刪除" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
