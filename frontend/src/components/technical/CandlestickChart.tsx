"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, X } from "lucide-react";

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
    | "bullish_island" | "bearish_island";
  position: "top" | "bottom";
  detail: string;
  pattern: string;
}

interface Props {
  data: KLineData[];
  annotations?: TechnicalAnnotation[];
  height?: number;
}

function calculateMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export default function CandlestickChart({ data, annotations = [], height = 400 }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<TechnicalAnnotation | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        暫無 K 線數據
      </div>
    );
  }

  const { chartData, priceRange, volumeMax, width, chartHeight, padding, chartTop } = useMemo(() => {
    const totalWidth = 900;
    const chartTopPos = 30;
    const chartBottom = height - 90;
    const chartH = chartBottom - chartTopPos;
    const pad = { top: 10, right: 70, bottom: 30, left: 10 };

    const closes = data.map((d) => d.close);
    const allHighs = data.map((d) => d.high);
    const allLows = data.map((d) => d.low);
    const ma5 = calculateMA(closes, 5);
    const ma10 = calculateMA(closes, 10);
    const ma20 = calculateMA(closes, 20);
    const ma60 = calculateMA(closes, 60);
    const ma120 = calculateMA(closes, 120);

    const minPrice = Math.min(...allLows) * 0.995;
    const maxPrice = Math.max(...allHighs) * 1.005;
    const volMax = Math.max(...data.map((d) => d.volume)) * 1.3;

    const cData = data.map((d, i) => ({
      ...d,
      ma5: ma5[i],
      ma10: ma10[i],
      ma20: ma20[i],
      ma60: ma60[i],
      ma120: ma120[i],
    }));

    return {
      chartData: cData,
      priceRange: [minPrice, maxPrice] as [number, number],
      volumeMax: volMax,
      width: totalWidth,
      chartHeight: chartH,
      padding: pad,
      chartTop: chartTopPos,
      chartBottom,
    };
  }, [data, height]);

  const barWidth = (width - padding.left - padding.right) / data.length;
  const candleWidth = Math.max(barWidth * 0.55, 5);

  const priceToY = (price: number) => {
    const [min, max] = priceRange;
    return chartTop + chartHeight - ((price - min) / (max - min)) * chartHeight;
  };

  const volumeToHeight = (vol: number) => {
    return (vol / volumeMax) * 45;
  };

  const maLinePoints = (maValues: (number | null)[]) => {
    return maValues
      .map((val, i) => {
        if (val === null) return null;
        const x = padding.left + i * barWidth + barWidth / 2;
        const y = priceToY(val);
        return `${x},${y}`;
      })
      .filter((p): p is string => p !== null)
      .join(" ");
  };

  const annotationColors: Record<string, string> = {
    golden_cross: "#10b981",
    death_cross: "#ef4444",
    support: "#3b82f6",
    resistance: "#f59e0b",
    breakout: "#8b5cf6",
    oversold: "#22c55e",
    overbought: "#f97316",
    // K 線形態 - 多頭
    bullish_marubozu: "#10b981",
    hammer: "#10b981",
    inverted_hammer: "#10b981",
    bullish_engulfing: "#10b981",
    morning_star: "#10b981",
    bullish_island: "#10b981",
    // K 線形態 - 空頭
    bearish_marubozu: "#ef4444",
    hanging_man: "#ef4444",
    gravestone: "#ef4444",
    bearish_engulfing: "#ef4444",
    evening_star: "#ef4444",
    bearish_island: "#ef4444",
    // K 線形態 - 中性
    doji: "#94a3b8",
    four_price_doji: "#94a3b8",
    spinning_top: "#94a3b8",
  };

  const annotationLabels: Record<string, string> = {
    golden_cross: "黃金交叉",
    death_cross: "死亡交叉",
    support: "支撐位",
    resistance: "壓力位",
    breakout: "突破",
    oversold: "超賣區",
    overbought: "超買區",
    bullish_marubozu: "紅燭台",
    bearish_marubozu: "黑燭台",
    hammer: "錘子",
    hanging_man: "上吊人",
    inverted_hammer: "倒錘子",
    gravestone: "墓碑",
    doji: "十字星",
    four_price_doji: "四價十字星",
    spinning_top: "紡錘頂/底",
    bullish_engulfing: "多頭吞噬",
    bearish_engulfing: "空頭吞噬",
    morning_star: "晨星",
    evening_star: "暮星",
    bullish_island: "島型反轉(多)",
    bearish_island: "島型反轉(空)",
  };

  return (
    <div className="w-full overflow-x-auto relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[700px]"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartTop + chartHeight * (1 - ratio);
          const price = priceRange[0] + (priceRange[1] - priceRange[0]) * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray="4 4"
              />
              <text
                x={width - padding.right + 8}
                y={y + 4}
                fontSize={11}
                fill="#94a3b8"
              >
                {price.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* MA Lines */}
        <polyline
          points={maLinePoints(chartData.map((d) => d.ma5))}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
        <polyline
          points={maLinePoints(chartData.map((d) => d.ma10))}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />
        <polyline
          points={maLinePoints(chartData.map((d) => d.ma20))}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth={1.5}
        />
        <polyline
          points={maLinePoints(chartData.map((d) => d.ma60))}
          fill="none"
          stroke="#ec4899"
          strokeWidth={1.5}
        />
        <polyline
          points={maLinePoints(chartData.map((d) => d.ma120))}
          fill="none"
          stroke="#14b8a6"
          strokeWidth={1.5}
        />

        {/* MA Legend */}
        <g transform={`translate(${padding.left + 8}, ${chartTop + 8})`}>
          <rect x={-4} y={-12} width={160} height={86} rx={6} fill="white" fillOpacity={0.92} stroke="#e2e8f0" strokeWidth={0.5} />
          <line x1={0} y1={0} x2={14} y2={0} stroke="#f59e0b" strokeWidth={2} />
          <text x={18} y={4} fontSize={11} fill="#64748b" fontWeight="500">MA5</text>
          <line x1={0} y1={18} x2={14} y2={18} stroke="#3b82f6" strokeWidth={2} />
          <text x={18} y={22} fontSize={11} fill="#64748b" fontWeight="500">MA10</text>
          <line x1={0} y1={36} x2={14} y2={36} stroke="#8b5cf6" strokeWidth={2} />
          <text x={18} y={40} fontSize={11} fill="#64748b" fontWeight="500">MA20</text>
          <line x1={0} y1={54} x2={14} y2={54} stroke="#ec4899" strokeWidth={2} />
          <text x={18} y={58} fontSize={11} fill="#64748b" fontWeight="500">MA60</text>
          <line x1={0} y1={72} x2={14} y2={72} stroke="#14b8a6" strokeWidth={2} />
          <text x={18} y={76} fontSize={11} fill="#64748b" fontWeight="500">MA120</text>
        </g>

        {/* Candlesticks */}
        {chartData.map((d, i) => {
          const x = padding.left + i * barWidth + barWidth / 2;
          const isUp = d.close >= d.open;
          const color = isUp ? "#22c55e" : "#ef4444";
          const bodyTop = priceToY(Math.max(d.open, d.close));
          const bodyBottom = priceToY(Math.min(d.open, d.close));
          const bodyHeight = Math.max(bodyBottom - bodyTop, 1.5);
          const wickTop = priceToY(d.high);
          const wickBottom = priceToY(d.low);
          const volHeight = volumeToHeight(d.volume);
          const volY = chartTop + chartHeight + 12;

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              style={{ cursor: "pointer" }}
            >
              {/* Highlight background on hover */}
              {hoveredIndex === i && (
                <rect
                  x={x - barWidth / 2}
                  y={chartTop}
                  width={barWidth}
                  height={chartHeight + 55}
                  fill="#f8fafc"
                  opacity={0.8}
                />
              )}

              {/* Wick */}
              <line
                x1={x}
                y1={wickTop}
                x2={x}
                y2={wickBottom}
                stroke={color}
                strokeWidth={1.2}
              />

              {/* Body */}
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                stroke={color}
                strokeWidth={0.5}
                rx={1}
              />

              {/* Volume bar */}
              <rect
                x={x - candleWidth / 2}
                y={volY}
                width={candleWidth}
                height={volHeight}
                fill={color}
                opacity={0.25}
                rx={1.5}
              />

              {/* Date label */}
              {i % Math.max(Math.floor(data.length / 12), 1) === 0 && (
                <text
                  x={x}
                  y={height - 10}
                  fontSize={10}
                  fill="#94a3b8"
                  textAnchor="middle"
                >
                  {d.date}
                </text>
              )}
            </g>
          );
        })}

        {/* Annotations */}
        {annotations.map((ann, i) => {
          const dataIndex = data.findIndex((d) => d.date === ann.date);
          if (dataIndex === -1) return null;
          const x = padding.left + dataIndex * barWidth + barWidth / 2;
          const color = annotationColors[ann.type];
          const label = annotationLabels[ann.type];

          // Calculate Y position based on the actual candle at that date
          const candle = chartData[dataIndex];
          const candleY = ann.position === "top" ? priceToY(candle.high) - 15 : priceToY(candle.low) + 15;

          return (
            <g
              key={i}
              onClick={() => setSelectedAnnotation(ann)}
              style={{ cursor: "pointer" }}
            >
              {/* Marker line */}
              <line
                x1={x}
                y1={candleY}
                x2={x}
                y2={ann.position === "top" ? candleY - 25 : candleY + 25}
                stroke={color}
                strokeWidth={1.2}
                strokeDasharray="4 2"
              />

              {/* Marker dot */}
              <circle cx={x} cy={candleY} r={4} fill={color} stroke="white" strokeWidth={2} />

              {/* Label */}
              <g transform={`translate(${x}, ${ann.position === "top" ? candleY - 38 : candleY + 38})`}>
                <rect
                  x={-32}
                  y={-10}
                  width={64}
                  height={20}
                  rx={10}
                  fill={color}
                  fillOpacity={0.15}
                  stroke={color}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={4}
                  fontSize={10}
                  fill={color}
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {label}
                </text>
              </g>
            </g>
          );
        })}

        {/* Crosshair line on hover */}
        {hoveredIndex !== null && (
          <line
            x1={padding.left + hoveredIndex * barWidth + barWidth / 2}
            y1={chartTop}
            x2={padding.left + hoveredIndex * barWidth + barWidth / 2}
            y2={chartTop + chartHeight}
            stroke="#94a3b8"
            strokeWidth={0.5}
            strokeDasharray="4 3"
          />
        )}

        {/* Tooltip */}
        {hoveredIndex !== null && chartData[hoveredIndex] && (
          <foreignObject
            x={Math.min(
              padding.left + hoveredIndex * barWidth + barWidth / 2 + 12,
              width - 170
            )}
            y={chartTop + 5}
            width={160}
            height={130}
          >
            <div
              style={{
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "11px",
                boxShadow: "0 8px 16px -4px rgb(0 0 0 / 0.12)",
              }}
            >
              {(() => {
                const d = chartData[hoveredIndex];
                const isUp = d.close >= d.open;
                const change = d.close - d.open;
                const changePercent = ((change / d.open) * 100).toFixed(2);
                return (
                  <>
                    <div className="font-semibold text-gray-700 mb-1.5">{d.date}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                      <span>開:</span><span className="font-mono font-medium">{d.open}</span>
                      <span>高:</span><span className="font-mono font-medium">{d.high}</span>
                      <span>低:</span><span className="font-mono font-medium">{d.low}</span>
                      <span>收:</span><span className={`font-mono font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>{d.close}</span>
                      <span>漲跌:</span><span className={`font-mono font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>{change >= 0 ? "+" : ""}{change} ({changePercent}%)</span>
                      <span>量:</span><span className="font-mono">{(d.volume / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex flex-wrap gap-x-2 gap-y-0.5 text-gray-500 text-xs">
                      {d.ma5 !== null && <span className="text-yellow-600">MA5:{d.ma5.toFixed(0)}</span>}
                      {d.ma10 !== null && <span className="text-blue-600">MA10:{d.ma10.toFixed(0)}</span>}
                      {d.ma20 !== null && <span className="text-purple-600">MA20:{d.ma20.toFixed(0)}</span>}
                      {d.ma60 !== null && <span className="text-pink-600">MA60:{d.ma60.toFixed(0)}</span>}
                      {d.ma120 !== null && <span className="text-teal-600">MA120:{d.ma120.toFixed(0)}</span>}
                    </div>
                  </>
                );
              })()}
            </div>
          </foreignObject>
        )}
      </svg>

      {/* Annotation Detail Modal */}
      {selectedAnnotation && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setSelectedAnnotation(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ backgroundColor: annotationColors[selectedAnnotation.type] + "18" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: annotationColors[selectedAnnotation.type] }}
                />
                <h3 className="text-lg font-bold" style={{ color: annotationColors[selectedAnnotation.type] }}>
                  {annotationLabels[selectedAnnotation.type]}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAnnotation(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
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
                <div className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {selectedAnnotation.detail}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-700">
                  點擊 K 線圖上的標記可快速查看此訊號詳情
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedAnnotation(null)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
