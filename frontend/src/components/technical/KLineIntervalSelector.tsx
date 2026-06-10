"use client";

import { useMemo } from "react";

interface IntervalOption {
  value: string;
  label: string;
  yahooInterval: string;
  description: string;
}

interface Props {
  selected: string;
  onChange: (interval: string) => void;
  disabled?: boolean;
}

const intervals: IntervalOption[] = [
  { value: "1d", label: "日K", yahooInterval: "1d", description: "日線圖" },
  { value: "1w", label: "週K", yahooInterval: "1wk", description: "週線圖" },
  { value: "1mo", label: "月K", yahooInterval: "1mo", description: "月線圖" },
  { value: "60m", label: "60分", yahooInterval: "60m", description: "60 分鐘線" },
  { value: "15m", label: "15分", yahooInterval: "15m", description: "15 分鐘線" },
  { value: "5m", label: "5分", yahooInterval: "5m", description: "5 分鐘線" },
];

export default function KLineIntervalSelector({ selected, onChange, disabled = false }: Props) {
  const current = useMemo(
    () => intervals.find((i) => i.value === selected) || intervals[0],
    [selected]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">K 線週期</label>
        <span className="text-xs text-gray-500">{current.description}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {intervals.map((interval) => {
          const isActive = selected === interval.value;
          return (
            <button
              key={interval.value}
              onClick={() => onChange(interval.value)}
              disabled={disabled}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {interval.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
