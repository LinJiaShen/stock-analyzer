"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

interface RadarData {
  value: number;
  momentum: number;
  chip: number;
  growth: number;
  resistance: number;
}

interface Props {
  data: RadarData;
  stockCode: string;
  loading?: boolean;
}

export default function RadarChartComponent({ data, stockCode, loading = false }: Props) {
  const chartData = [
    { subject: "價值", A: data.value, fullMark: 100 },
    { subject: "動能", A: data.momentum, fullMark: 100 },
    { subject: "籌碼", A: data.chip, fullMark: 100 },
    { subject: "成長", A: data.growth, fullMark: 100 },
    { subject: "抗跌", A: data.resistance, fullMark: 100 },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">雷達圖分析</h3>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">雷達圖分析 - {stockCode}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Radar
              name={stockCode}
              dataKey="A"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
