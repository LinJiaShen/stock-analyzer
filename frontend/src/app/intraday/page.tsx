"use client";

import { Clock, TrendingUp, TrendingDown, AlertTriangle, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import WatchlistCard, { type WatchlistStock } from "@/components/war-room/WatchlistCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function IntradayPage() {
  const now = new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 模擬大盤即時數據
  const indexData = {
    name: "加權指數",
    value: 18500,
    change: 92,
    change_percent: 0.50,
    volume: "450 億",
  };

  // 模擬 K 線圖數據 (5 分鐘線)
  const klineData = [
    { time: "09:00", price: 18420 },
    { time: "09:05", price: 18435 },
    { time: "09:10", price: 18428 },
    { time: "09:15", price: 18445 },
    { time: "09:20", price: 18460 },
    { time: "09:25", price: 18455 },
    { time: "09:30", price: 18470 },
    { time: "09:35", price: 18485 },
    { time: "09:40", price: 18478 },
    { time: "09:45", price: 18490 },
    { time: "09:50", price: 18495 },
    { time: "09:55", price: 18500 },
  ];

  // 模擬即時警示
  const alerts = [
    {
      id: "1",
      type: "sell",
      stock: "2330",
      message: "大單賣出 500 張 @ 575",
      time: "14:28",
    },
    {
      id: "2",
      type: "breakout",
      stock: "2454",
      message: "突破頸線 42.5 量能放大 2.5 倍",
      time: "14:25",
    },
    {
      id: "3",
      type: "buy",
      stock: "3034",
      message: "外資大筆買入 300 萬美元",
      time: "14:20",
    },
  ];

  // 模擬關注個股
  const watchlist: WatchlistStock[] = [
    {
      code: "2330",
      name: "台積電",
      price: 575,
      change: 6.8,
      change_percent: 1.20,
      status: "正常",
    },
    {
      code: "2454",
      name: "聯電",
      price: 42.5,
      change: 1.45,
      change_percent: 3.54,
      status: "突破中",
    },
    {
      code: "3034",
      name: "台積電封測",
      price: 122.5,
      change: 2.1,
      change_percent: 1.75,
      status: "正常",
    },
    {
      code: "2317",
      name: "鴻海",
      price: 285,
      change: -3.5,
      change_percent: -1.21,
      status: "警示",
    },
  ];

  const alertIcon = {
    sell: { icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
    breakout: { icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
    buy: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">盤中實時追蹤</h1>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            <Clock className="w-4 h-4" />
            {now} 交易中
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-gray-600">即時更新</span>
        </div>
      </div>

      {/* 大盤即時狀態 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{indexData.name}</h2>
            <span className="text-2xl font-bold font-mono text-gray-900">
              {indexData.value.toLocaleString()}
            </span>
            <span
              className={`text-sm font-medium px-2 py-0.5 rounded ${
                indexData.change_percent >= 0
                  ? "text-green-700 bg-green-50"
                  : "text-red-700 bg-red-50"
              }`}
            >
              {indexData.change_percent >= 0 ? "+" : ""}
              {indexData.change_percent.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <BarChart3 className="w-4 h-4" />
            成交量: {indexData.volume}
          </div>
        </div>

        {/* 即時 K 線圖 */}
        <div className="h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={klineData}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorPrice)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 即時警示 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              即時警示
              <span className="text-yellow-500">⚡</span>
            </h3>
            <div className="space-y-3">
              {alerts.map((alert) => {
                const config = alertIcon[alert.type as keyof typeof alertIcon];
                const Icon = config.icon;
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${config.bg} ${config.border}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-900">{alert.stock}</span>
                          <span className="text-xs text-gray-400">{alert.time}</span>
                        </div>
                        <p className="text-xs text-gray-700">{alert.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 關注個股 */}
        <div className="lg:col-span-2">
          <WatchlistCard stocks={watchlist} mode="intraday" />
        </div>
      </div>
    </div>
  );
}
