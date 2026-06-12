"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Bar {
  close: number;
  date: string;
}

/**
 * 首頁署名圖：真實台積電近一年走勢，載入時緩緩自繪。
 * 設計原則：是資料、不是裝飾 — 低對比網格、單色線、終點一個呼吸光點。
 */
export default function HeroChart() {
  const [bars, setBars] = useState<Bar[]>([]);

  useEffect(() => {
    api.get("/api/stocks/2330/kline", { params: { interval: "1d", limit: 240 }, timeout: 15000 })
      .then((res) => {
        const data = (res.data?.data ?? []).map((d: any) => ({ close: d.close ?? 0, date: d.date }));
        // 後端可能回傳超過 limit 的根數，取最近一年（~240 個交易日）
        setBars(data.filter((d: Bar) => d.close > 0).slice(-240));
      })
      .catch(() => setBars([]));
  }, []);

  const W = 560;
  const H = 300;
  const PAD = { top: 24, right: 64, bottom: 28, left: 12 };

  const { path, areaPath, last, lastXY, yTicks } = useMemo(() => {
    if (bars.length < 10) return { path: "", areaPath: "", last: null as Bar | null, lastXY: [0, 0], yTicks: [] as { y: number; label: string }[] };

    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    const x = (i: number) => PAD.left + (i / (bars.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - min) / range) * (H - PAD.top - PAD.bottom);

    const pts = bars.map((b, i) => `${x(i).toFixed(1)},${y(b.close).toFixed(1)}`);
    const p = `M${pts.join(" L")}`;
    const area = `${p} L${x(bars.length - 1).toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z`;

    const ticks = [max, (max + min) / 2, min].map((v) => ({
      y: y(v),
      label: v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(0),
    }));

    return {
      path: p,
      areaPath: area,
      last: bars[bars.length - 1],
      lastXY: [x(bars.length - 1), y(closes[closes.length - 1])],
      yTicks: ticks,
    };
  }, [bars]);

  if (!path) {
    return <div className="w-full h-[300px]" />;
  }

  const yearChange = bars.length > 1
    ? ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100
    : 0;

  return (
    <Link href="/stock/2330" className="block group">
      <div className="flex items-baseline justify-between mb-1 px-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-slate-300 group-hover:text-white transition-colors">
            台積電 2330
          </span>
          <span className="text-[11px] text-slate-500">近一年</span>
        </div>
        <div className="flex items-baseline gap-2 animate-fade-late">
          <span className="text-lg font-mono font-bold text-white">
            {last?.close.toLocaleString()}
          </span>
          <span className={`text-[12px] font-mono ${yearChange >= 0 ? "text-red-400" : "text-green-400"}`}>
            {yearChange >= 0 ? "+" : ""}{yearChange.toFixed(1)}%
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
        <defs>
          <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 低對比水平網格 + 價格刻度 */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right + 8} y2={t.y}
              stroke="#334155" strokeWidth="0.5" strokeDasharray="2 6" opacity="0.6" />
            <text x={W - PAD.right + 14} y={t.y + 3.5} fill="#475569" fontSize="10" fontFamily="var(--font-geist-mono)">
              {t.label}
            </text>
          </g>
        ))}

        {/* 面積 + 主線（自繪動畫） */}
        <path d={areaPath} fill="url(#heroArea)" className="animate-fade-late" />
        <path d={path} fill="none" stroke="#a5b4fc" strokeWidth="1.75"
          strokeLinejoin="round" strokeLinecap="round" className="animate-draw" />

        {/* 終點呼吸光點 + 現價 */}
        <circle cx={lastXY[0]} cy={lastXY[1]} r="10" fill="#a5b4fc" opacity="0.15" className="animate-glow" />
        <circle cx={lastXY[0]} cy={lastXY[1]} r="3" fill="#c7d2fe" className="animate-fade-late" />
      </svg>
      <p className="text-[10px] text-slate-600 px-1 mt-1">
        實際平台資料・點擊查看完整分析 →
      </p>
    </Link>
  );
}
