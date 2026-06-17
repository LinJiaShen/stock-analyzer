"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { TrendingUp, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";

interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5?: number | null;
  ma10?: number | null;
  ma20?: number | null;
  ma60?: number | null;
  ma120?: number | null;
}

export interface TechnicalAnnotation {
  date: string;
  label: string;
  type: "golden_cross" | "death_cross" | "support" | "resistance" | "breakout" | "oversold" | "overbought"
    | "bullish_marubozu" | "bearish_marubozu" | "hammer" | "hanging_man"
    | "inverted_hammer" | "gravestone" | "doji" | "four_price_doji" | "spinning_top"
    | "bullish_engulfing" | "bearish_engulfing" | "morning_star" | "evening_star"
    | "bullish_island" | "bearish_island"
    | "bullish_divergence" | "bearish_divergence" | "bb_squeeze";
  position: "top" | "bottom";
  detail: string;
  pattern: string;
  price?: number;
}

/**
 * 圖表疊圖（結構/交易劇本用）。
 * 注意：`p1/p2.date` 與 hline/zone 的比對沿用 `data[].date` 的「同一字串空間」——
 * 呼叫端必須先把後端 ISO 日期經過與 klineData 相同的格式轉換再傳入，否則 findIndex 配不到。
 */
export interface ChartOverlay {
  id: string;
  kind: "zone" | "line" | "hline";
  priceLow?: number;   // zone 下緣
  priceHigh?: number;  // zone 上緣
  price?: number;      // hline 價位
  p1?: { date: string; price: number };  // line 端點（同 data[].date 字串）
  p2?: { date: string; price: number };
  color?: string;
  label?: string;
  dashed?: boolean;
  opacity?: number;
}

interface Props {
  data: KLineData[];
  annotations?: TechnicalAnnotation[];
  overlays?: ChartOverlay[];
  /** 把疊圖價位納入 Y 軸範圍，避免放大後被裁切（預設 true）。 */
  fitOverlays?: boolean;
  height?: number;
}

function calculateMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

const annotationColors: Record<string, string> = {
  golden_cross: "#10b981", death_cross: "#ef4444", support: "#3b82f6",
  resistance: "#f59e0b", breakout: "#8b5cf6", oversold: "#22c55e", overbought: "#f97316",
  bullish_marubozu: "#10b981", hammer: "#10b981", inverted_hammer: "#10b981",
  bullish_engulfing: "#10b981", morning_star: "#10b981", bullish_island: "#10b981",
  bearish_marubozu: "#ef4444", hanging_man: "#ef4444", gravestone: "#ef4444",
  bearish_engulfing: "#ef4444", evening_star: "#ef4444", bearish_island: "#ef4444",
  doji: "#94a3b8", four_price_doji: "#94a3b8", spinning_top: "#94a3b8",
  bullish_divergence: "#10b981", bearish_divergence: "#ef4444", bb_squeeze: "#f59e0b",
};

const annotationLabels: Record<string, string> = {
  golden_cross: "黃金交叉", death_cross: "死亡交叉", support: "支撐位", resistance: "壓力位",
  breakout: "突破", oversold: "超賣區", overbought: "超買區",
  bullish_marubozu: "紅燭台", bearish_marubozu: "黑燭台", hammer: "錘子",
  hanging_man: "上吊人", inverted_hammer: "倒錘子", gravestone: "墓碑",
  doji: "十字星", four_price_doji: "四價十字星", spinning_top: "紡錘頂/底",
  bullish_engulfing: "多頭吞噬", bearish_engulfing: "空頭吞噬",
  morning_star: "晨星", evening_star: "暮星",
  bullish_island: "島型反轉(多)", bearish_island: "島型反轉(空)",
  bullish_divergence: "底背離", bearish_divergence: "頂背離", bb_squeeze: "布林擠壓",
};

const DEFAULT_VIEW = 60; // 預設顯示最近 60 根
const MIN_VIEW = 10;

export default function CandlestickChart({ data, annotations = [], overlays = [], fitOverlays = true, height = 400 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null); // index in visibleData
  const [selectedAnnotation, setSelectedAnnotation] = useState<TechnicalAnnotation | null>(null);

  // drag pan
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<[number, number]>([0, 0]);

  // navigator drag
  const isNavDraggingRef = useRef(false);
  const navDragStartXRef = useRef(0);
  const navDragStartRangeRef = useRef<[number, number]>([0, 0]);

  // 初始化 viewRange：預設顯示最後 DEFAULT_VIEW 根
  useEffect(() => {
    if (!data.length) return;
    const end = data.length - 1;
    const start = Math.max(0, end - DEFAULT_VIEW + 1);
    setViewStart(start);
    setViewEnd(end);
  }, [data]);

  const visibleData = useMemo(() => data.slice(viewStart, viewEnd + 1), [data, viewStart, viewEnd]);
  const visibleCount = viewEnd - viewStart + 1;

  // 預計算 MA（全局）
  const allMA = useMemo(() => {
    const closes = data.map((d) => d.close);
    return {
      ma5: calculateMA(closes, 5),
      ma10: calculateMA(closes, 10),
      ma20: calculateMA(closes, 20),
      ma60: calculateMA(closes, 60),
      ma120: calculateMA(closes, 120),
    };
  }, [data]);

  const visibleWithMA = useMemo(() =>
    visibleData.map((d, i) => ({
      ...d,
      ma5: allMA.ma5[viewStart + i],
      ma10: allMA.ma10[viewStart + i],
      ma20: allMA.ma20[viewStart + i],
      ma60: allMA.ma60[viewStart + i],
      ma120: allMA.ma120[viewStart + i],
    })),
    [visibleData, allMA, viewStart]
  );

  // ── SVG layout ──
  const SVG_W = 900;
  const CHART_TOP = 30;
  const CHART_BOTTOM = height - 90;
  const CHART_H = CHART_BOTTOM - CHART_TOP;
  const PAD = { left: 10, right: 70 };

  const priceRange = useMemo(() => {
    if (!visibleData.length) return [0, 1] as [number, number];
    let lo = Math.min(...visibleData.map((d) => d.low));
    let hi = Math.max(...visibleData.map((d) => d.high));
    if (fitOverlays && overlays.length) {
      const span = hi - lo || hi || 1;
      const fold = (p: number | undefined, tol: number) => {
        if (p == null) return;
        if (p >= lo - span * tol && p <= hi + span * tol) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
      };
      for (const o of overlays) {
        if (o.kind === "hline") fold(o.price, 0.25);            // 進場/停損/目標：較寬容忍、近價必納入
        else if (o.kind === "zone") { fold(o.priceLow, 0.15); fold(o.priceHigh, 0.15); }
        else if (o.kind === "line") { fold(o.p1?.price, 0.15); fold(o.p2?.price, 0.15); }
      }
    }
    return [lo * 0.995, hi * 1.005] as [number, number];
  }, [visibleData, overlays, fitOverlays]);

  const volumeMax = useMemo(() =>
    Math.max(...visibleData.map((d) => d.volume)) * 1.3 || 1,
    [visibleData]
  );

  const barW = (SVG_W - PAD.left - PAD.right) / Math.max(visibleCount, 1);
  const candleW = Math.max(barW * 0.55, 2);

  const priceToY = useCallback((price: number) => {
    const [min, max] = priceRange;
    return CHART_TOP + CHART_H - ((price - min) / (max - min)) * CHART_H;
  }, [priceRange, CHART_TOP, CHART_H]);

  const maLinePoints = useCallback((maValues: (number | null)[]) =>
    maValues.map((val, i) => {
      if (val === null) return null;
      const x = PAD.left + i * barW + barW / 2;
      return `${x},${priceToY(val)}`;
    }).filter((p): p is string => p !== null).join(" "),
    [barW, priceToY, PAD.left]
  );

  // ── Zoom helpers ──
  const applyZoom = useCallback((delta: number, pivotRatio: number) => {
    const change = Math.max(1, Math.round(visibleCount * 0.05));
    const leftChange = Math.round(change * pivotRatio);
    const rightChange = change - leftChange;
    let newStart = viewStart + delta * leftChange;
    let newEnd = viewEnd - delta * rightChange;
    newStart = Math.max(0, newStart);
    newEnd = Math.min(data.length - 1, newEnd);
    if (newEnd - newStart < MIN_VIEW - 1) return;
    setViewStart(newStart);
    setViewEnd(newEnd);
    setHoveredIndex(null);
  }, [viewStart, viewEnd, visibleCount, data.length]);

  // ── Mouse wheel zoom ──
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      applyZoom(e.deltaY > 0 ? 1 : -1, ratio);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // ── Drag pan ──
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only left button, not on annotation
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = [viewStart, viewEnd];
  }, [viewStart, viewEnd]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - dragStartXRef.current;
    const pixelsPerBar = rect.width / visibleCount;
    const shift = Math.round(-dx / pixelsPerBar);
    const [s, end_] = dragStartRangeRef.current;
    const span = end_ - s;
    const newStart = Math.max(0, Math.min(data.length - 1 - span, s + shift));
    setViewStart(newStart);
    setViewEnd(newStart + span);
  }, [visibleCount, data.length]);

  const onMouseUp = useCallback(() => { isDraggingRef.current = false; }, []);

  // ── Navigator (bottom bar) ──
  const NAV_H = 48;
  const navCloses = data.map((d) => d.close);
  const navMin = Math.min(...navCloses) * 0.995;
  const navMax = Math.max(...navCloses) * 1.005;
  const navPriceToY = (p: number) =>
    NAV_H - 2 - ((p - navMin) / (navMax - navMin)) * (NAV_H - 4);

  const navLinePoints = navCloses.map((c, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = navPriceToY(c);
    return `${x}%,${y}`;
  }).join(" ");

  const navLeft = `${(viewStart / Math.max(data.length - 1, 1)) * 100}%`;
  const navWidth = `${((viewEnd - viewStart) / Math.max(data.length - 1, 1)) * 100}%`;

  const onNavMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isNavDraggingRef.current = true;
    navDragStartXRef.current = e.clientX;
    navDragStartRangeRef.current = [viewStart, viewEnd];
    e.preventDefault();
  }, [viewStart, viewEnd]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isNavDraggingRef.current) return;
      const navEl = containerRef.current?.querySelector(".nav-bar") as HTMLElement;
      if (!navEl) return;
      const rect = navEl.getBoundingClientRect();
      const dx = e.clientX - navDragStartXRef.current;
      const ratio = dx / rect.width;
      const shift = Math.round(ratio * (data.length - 1));
      const [s, end_] = navDragStartRangeRef.current;
      const span = end_ - s;
      const newStart = Math.max(0, Math.min(data.length - 1 - span, s + shift));
      setViewStart(newStart);
      setViewEnd(newStart + span);
    };
    const onUp = () => { isNavDraggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [data.length]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-96 text-gray-400">暫無 K 線數據</div>;
  }

  return (
    <div ref={containerRef} className="w-full select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => applyZoom(-1, 0.5)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => applyZoom(1, 0.5)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="縮小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setViewStart(0); setViewEnd(data.length - 1); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="顯示全部"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          {[30, 60, 120].map((n) => (
            <button
              key={n}
              onClick={() => {
                const end = data.length - 1;
                setViewStart(Math.max(0, end - n + 1));
                setViewEnd(end);
              }}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                visibleCount === n ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {n}根
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">
          {visibleCount} 根 K 線（滾輪縮放・拖拽平移）
        </span>
      </div>

      {/* MA Legend (HTML, not SVG overlay) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 mb-2">
        {(["MA5", "MA10", "MA20", "MA60", "MA120"] as const).map((label, i) => {
          const colors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
          return (
            <span key={label} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: colors[i] }} />
              {label}
            </span>
          );
        })}
      </div>

      {/* Main chart */}
      <div className="overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${height}`}
          className="w-full min-w-[600px]"
          style={{ cursor: isDraggingRef.current ? "grabbing" : "crosshair" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHoveredIndex(null); onMouseUp(); }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = CHART_TOP + CHART_H * (1 - ratio);
            const price = priceRange[0] + (priceRange[1] - priceRange[0]) * ratio;
            return (
              <g key={ratio}>
                <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} stroke="#f1f5f9" strokeDasharray="4 4" />
                <text x={SVG_W - PAD.right + 8} y={y + 4} fontSize={11} fill="#94a3b8">{price.toFixed(0)}</text>
              </g>
            );
          })}

          {/* Overlay zones（支撐壓力區帶，畫在 K 棒後方） */}
          {overlays.filter((o) => o.kind === "zone").map((o) => {
            const color = o.color || "#3b82f6";
            const yA = priceToY(o.priceHigh ?? 0);
            const yB = priceToY(o.priceLow ?? 0);
            const top = Math.min(yA, yB);
            const bot = Math.max(yA, yB);
            const topEdge = CHART_TOP;
            const botEdge = CHART_TOP + CHART_H;
            if (bot < topEdge) return <text key={o.id} x={SVG_W - PAD.right - 4} y={topEdge + 11} fontSize={10} fill={color} textAnchor="end" fontWeight={600}>▲ {o.label}</text>;
            if (top > botEdge) return <text key={o.id} x={SVG_W - PAD.right - 4} y={botEdge - 4} fontSize={10} fill={color} textAnchor="end" fontWeight={600}>▼ {o.label}</text>;
            const cy = Math.max(top, topEdge);
            const ch = Math.max(Math.min(bot, botEdge) - cy, 1);
            return (
              <g key={o.id}>
                <rect x={PAD.left} y={cy} width={SVG_W - PAD.left - PAD.right} height={ch} fill={color} fillOpacity={o.opacity ?? 0.08} />
                <line x1={PAD.left} y1={cy} x2={SVG_W - PAD.right} y2={cy} stroke={color} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />
                <line x1={PAD.left} y1={cy + ch} x2={SVG_W - PAD.right} y2={cy + ch} stroke={color} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />
                {o.label && <text x={PAD.left + 4} y={cy + 11} fontSize={10} fill={color} fontWeight={600}>{o.label}</text>}
              </g>
            );
          })}

          {/* MA Lines */}
          {(["ma5", "ma10", "ma20", "ma60", "ma120"] as const).map((key, i) => {
            const colors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
            return (
              <polyline
                key={key}
                points={maLinePoints(visibleWithMA.map((d) => d[key] ?? null))}
                fill="none"
                stroke={colors[i]}
                strokeWidth={1.5}
              />
            );
          })}

          {/* Candlesticks */}
          {visibleWithMA.map((d, i) => {
            const x = PAD.left + i * barW + barW / 2;
            const isUp = d.close >= d.open;
            // 台股慣例：紅K=漲、綠K=跌
            const color = isUp ? "#ef4444" : "#16a34a";
            const bodyTop = priceToY(Math.max(d.open, d.close));
            const bodyBottom = priceToY(Math.min(d.open, d.close));
            const bodyH = Math.max(bodyBottom - bodyTop, 1.5);
            const volH = (d.volume / volumeMax) * 45;
            const volY = CHART_TOP + CHART_H + 12;

            return (
              <g key={i} onMouseEnter={() => setHoveredIndex(i)} style={{ pointerEvents: "all" }}>
                {hoveredIndex === i && (
                  <rect x={x - barW / 2} y={CHART_TOP} width={barW} height={CHART_H + 55} fill="#f8fafc" opacity={0.8} />
                )}
                <line x1={x} y1={priceToY(d.high)} x2={x} y2={priceToY(d.low)} stroke={color} strokeWidth={1.2} />
                <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} rx={1} />
                <rect x={x - candleW / 2} y={volY} width={candleW} height={volH} fill={color} opacity={0.25} rx={1.5} />
                {i % Math.max(Math.floor(visibleCount / 10), 1) === 0 && (
                  <text x={x} y={height - 10} fontSize={10} fill="#94a3b8" textAnchor="middle">{d.date}</text>
                )}
              </g>
            );
          })}

          {/* Overlay 趨勢線/通道（沿斜率延伸至可見窗兩端） */}
          {overlays.filter((o) => o.kind === "line").map((o) => {
            if (!o.p1 || !o.p2) return null;
            const gi1 = data.findIndex((d) => d.date === o.p1!.date);
            const gi2 = data.findIndex((d) => d.date === o.p2!.date);
            if (gi1 < 0 || gi2 < 0 || gi1 === gi2) return null;
            const slope = (o.p2.price - o.p1.price) / (gi2 - gi1);
            const priceAt = (gi: number) => o.p1!.price + slope * (gi - gi1);
            const xAt = (gi: number) => PAD.left + (gi - viewStart) * barW + barW / 2;
            const color = o.color || "#8b5cf6";
            return (
              <line key={o.id} x1={xAt(viewStart)} y1={priceToY(priceAt(viewStart))} x2={xAt(viewEnd)} y2={priceToY(priceAt(viewEnd))}
                stroke={color} strokeWidth={1.4} strokeDasharray={o.dashed ? "5 3" : undefined} opacity={0.85} />
            );
          })}

          {/* Overlay hlines（進場/停損/目標參考線） */}
          {overlays.filter((o) => o.kind === "hline" && o.price != null).map((o) => {
            const color = o.color || "#0ea5e9";
            const y = priceToY(o.price!);
            const topEdge = CHART_TOP;
            const botEdge = CHART_TOP + CHART_H;
            if (y < topEdge) return <text key={o.id} x={SVG_W - PAD.right - 4} y={topEdge + 11} fontSize={10} fill={color} textAnchor="end" fontWeight={600}>▲ {o.label}</text>;
            if (y > botEdge) return <text key={o.id} x={SVG_W - PAD.right - 4} y={botEdge - 4} fontSize={10} fill={color} textAnchor="end" fontWeight={600}>▼ {o.label}</text>;
            return (
              <g key={o.id}>
                <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray={o.dashed ? "5 3" : "6 3"} opacity={0.9} />
                {o.label && (
                  <g>
                    <rect x={PAD.left + 2} y={y - 9} width={o.label.length * 6.8 + 10} height={14} rx={3} fill={color} fillOpacity={0.14} />
                    <text x={PAD.left + 6} y={y + 1.5} fontSize={10} fill={color} fontWeight={600}>{o.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Annotations */}
          {annotations.map((ann, i) => {
            const globalIdx = data.findIndex((d) => d.date === ann.date);
            if (globalIdx < viewStart || globalIdx > viewEnd) return null;
            const localIdx = globalIdx - viewStart;
            const x = PAD.left + localIdx * barW + barW / 2;
            const color = annotationColors[ann.type];
            const candle = visibleWithMA[localIdx];
            if (!candle) return null;
            const candleY = ann.position === "top" ? priceToY(candle.high) - 15 : priceToY(candle.low) + 15;

            return (
              <g key={i} onClick={(e) => { e.stopPropagation(); setSelectedAnnotation(ann); }} style={{ cursor: "pointer" }}>
                <line x1={x} y1={candleY} x2={x} y2={ann.position === "top" ? candleY - 25 : candleY + 25} stroke={color} strokeWidth={1.2} strokeDasharray="4 2" />
                <circle cx={x} cy={candleY} r={4} fill={color} stroke="white" strokeWidth={2} />
                <g transform={`translate(${x}, ${ann.position === "top" ? candleY - 38 : candleY + 38})`}>
                  <rect x={-32} y={-10} width={64} height={20} rx={10} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1} />
                  <text x={0} y={4} fontSize={10} fill={color} textAnchor="middle" fontWeight="600">{annotationLabels[ann.type]}</text>
                </g>
              </g>
            );
          })}

          {/* Crosshair */}
          {hoveredIndex !== null && (
            <line
              x1={PAD.left + hoveredIndex * barW + barW / 2}
              y1={CHART_TOP}
              x2={PAD.left + hoveredIndex * barW + barW / 2}
              y2={CHART_TOP + CHART_H}
              stroke="#94a3b8"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          )}

          {/* Tooltip */}
          {hoveredIndex !== null && visibleWithMA[hoveredIndex] && (() => {
            const d = visibleWithMA[hoveredIndex];
            const isUp = d.close >= d.open;
            const change = d.close - d.open;
            const pct = ((change / d.open) * 100).toFixed(2);
            const x = PAD.left + hoveredIndex * barW + barW / 2;
            const tooltipX = Math.min(x + 12, SVG_W - 170);
            return (
              <foreignObject x={tooltipX} y={CHART_TOP + 5} width={160} height={140}>
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px 12px", fontSize: "11px", boxShadow: "0 8px 16px -4px rgb(0 0 0 / 0.12)" }}>
                  <div className="font-semibold text-gray-700 mb-1.5">{d.date}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                    <span>開:</span><span className="font-mono font-medium">{d.open}</span>
                    <span>高:</span><span className="font-mono font-medium">{d.high}</span>
                    <span>低:</span><span className="font-mono font-medium">{d.low}</span>
                    <span>收:</span><span className={`font-mono font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>{d.close}</span>
                    <span>漲跌:</span><span className={`font-mono font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>{change >= 0 ? "+" : ""}{change.toFixed(1)}({pct}%)</span>
                    <span>量:</span><span className="font-mono">{(d.volume / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex flex-wrap gap-x-2 gap-y-0.5 text-gray-500 text-xs">
                    {d.ma5 != null && <span className="text-yellow-600">MA5:{d.ma5.toFixed(0)}</span>}
                    {d.ma10 != null && <span className="text-blue-600">MA10:{d.ma10.toFixed(0)}</span>}
                    {d.ma20 != null && <span className="text-purple-600">MA20:{d.ma20.toFixed(0)}</span>}
                    {d.ma60 != null && <span className="text-pink-600">MA60:{d.ma60.toFixed(0)}</span>}
                    {d.ma120 != null && <span className="text-teal-600">MA120:{d.ma120.toFixed(0)}</span>}
                  </div>
                </div>
              </foreignObject>
            );
          })()}
        </svg>
      </div>

      {/* Navigator bar */}
      {data.length > DEFAULT_VIEW && (
        <div className="mt-2 px-1">
          <div
            className="nav-bar relative bg-gray-50 border border-gray-200 rounded-lg overflow-hidden"
            style={{ height: NAV_H }}
          >
            {/* Full price line */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${NAV_H}`}>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <polyline points={navLinePoints} fill="none" stroke="#3b82f6" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Viewport window — draggable */}
            <div
              className="absolute top-0 bottom-0 bg-blue-500/10 border-x-2 border-blue-400 cursor-grab active:cursor-grabbing"
              style={{ left: navLeft, width: navWidth }}
              onMouseDown={onNavMouseDown}
            />

            {/* Dimmed outside */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(to right, rgba(248,250,252,0.6) ${navLeft}, transparent ${navLeft}, transparent calc(${navLeft} + ${navWidth}), rgba(248,250,252,0.6) calc(${navLeft} + ${navWidth}))`
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-0.5 px-0.5">
            <span>{data[0]?.date}</span>
            {(() => {
              // 當數據跨度超過一年時，顯示中間的年份標記
              const firstDate = data[0]?.date;
              const lastDate = data[data.length - 1]?.date;
              if (firstDate && lastDate && data.length > 30) {
                const midIndex = Math.floor(data.length / 2);
                const midDate = data[midIndex]?.date;
                if (midDate && midDate !== firstDate && midDate !== lastDate) {
                  return <span>{midDate}</span>;
                }
              }
              return null;
            })()}
            <span>{data[data.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Annotation Detail Modal */}
      {selectedAnnotation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedAnnotation(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: annotationColors[selectedAnnotation.type] + "18" }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: annotationColors[selectedAnnotation.type] }} />
                <h3 className="text-lg font-bold" style={{ color: annotationColors[selectedAnnotation.type] }}>
                  {annotationLabels[selectedAnnotation.type]}
                </h3>
              </div>
              <button onClick={() => setSelectedAnnotation(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">發生日期</div>
                <div className="text-base font-medium text-gray-900">{selectedAnnotation.date}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">K 線型態</div>
                <div className="text-base font-medium text-gray-900">{selectedAnnotation.pattern}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">詳細說明</div>
                <div className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">{selectedAnnotation.detail}</div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-700">點擊 K 線圖上的標記可快速查看此訊號詳情</span>
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 flex justify-end">
              <button onClick={() => setSelectedAnnotation(null)} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
