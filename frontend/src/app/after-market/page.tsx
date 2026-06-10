"use client";

import { Calendar, TrendingUp, TrendingDown, Star } from "lucide-react";
import WatchlistCard, { type WatchlistStock } from "@/components/war-room/WatchlistCard";

export default function AfterMarketPage() {
  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // 模擬三大法人買賣超
  const legalData = [
    {
      code: "2330",
      name: "台積電",
      foreign: 5000,
      invest_trust: -2000,
      proprietary: 1000,
    },
    {
      code: "2454",
      name: "聯電",
      foreign: 3000,
      invest_trust: 1500,
      proprietary: -500,
    },
    {
      code: "3034",
      name: "台積電封測",
      foreign: 1500,
      invest_trust: 800,
      proprietary: -200,
    },
    {
      code: "2317",
      name: "鴻海",
      foreign: -2500,
      invest_trust: 1200,
      proprietary: 3000,
    },
    {
      code: "2303",
      name: "廣達",
      foreign: 800,
      invest_trust: -500,
      proprietary: 300,
    },
  ];

  // 模擬籌碼集中度變化
  const concentrationData = [
    { code: "2330", name: "台積電", ratio: 72.5, trend: "up" },
    { code: "2454", name: "聯電", ratio: 65.3, trend: "up" },
    { code: "3034", name: "台積電封測", ratio: 58.8, trend: "stable" },
    { code: "2317", name: "鴻海", ratio: 52.1, trend: "down" },
  ];

  // 模擬明日推薦
  const recommendations: WatchlistStock[] = [
    {
      code: "2454",
      name: "聯電",
      signal: "綜合評分: 82 強勢偏多\n理由: 外資連買 + 技術突破 + 產業鏈補漲",
    },
    {
      code: "3034",
      name: "台積電封測",
      signal: "綜合評分: 78 偏多\n理由: 封測需求增長 + 籌碼集中",
    },
    {
      code: "2303",
      name: "廣達",
      signal: "綜合評分: 75 偏多\n理由: AI 伺服器需求 + 外資回補",
    },
  ];

  const formatValue = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    const unit = Math.abs(val) >= 10000 ? "百萬" : "萬";
    const num = unit === "百萬" ? (val / 10000).toFixed(0) : val.toFixed(0);
    return `${sign}${num}${unit}`;
  };

  const valueColor = (val: number) => {
    if (val > 0) return "text-green-700";
    if (val < 0) return "text-red-700";
    return "text-gray-500";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">盤後覆盤</h1>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            <Calendar className="w-4 h-4" />
            {today}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-gray-400 rounded-full" />
          <span className="text-gray-600">收盤</span>
        </div>
      </div>

      {/* 三大法人買賣超 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">三大法人買賣超</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">個股</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">外資</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">投信</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">自營商</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">合計</th>
              </tr>
            </thead>
            <tbody>
              {legalData.map((row) => {
                const total = row.foreign + row.invest_trust + row.proprietary;
                return (
                  <tr key={row.code} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{row.code}</span>
                        <span className="text-gray-600">{row.name}</span>
                      </div>
                    </td>
                    <td className={`text-right py-3 px-4 font-mono font-medium ${valueColor(row.foreign)}`}>
                      {formatValue(row.foreign)}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono font-medium ${valueColor(row.invest_trust)}`}>
                      {formatValue(row.invest_trust)}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono font-medium ${valueColor(row.proprietary)}`}>
                      {formatValue(row.proprietary)}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono font-bold ${valueColor(total)}`}>
                      {formatValue(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 籌碼集中度變化 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">籌碼集中度變化</h3>
          <div className="space-y-4">
            {concentrationData.map((item) => (
              <div key={item.code} className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <span className="text-sm font-bold text-gray-900">{item.code}</span>
                  <span className="text-xs text-gray-500 ml-1">{item.name}</span>
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.ratio >= 65
                          ? "bg-green-500"
                          : item.ratio >= 55
                          ? "bg-blue-500"
                          : "bg-yellow-500"
                      }`}
                      style={{ width: `${item.ratio}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 w-16 justify-end">
                  {item.trend === "up" ? (
                    <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                  ) : item.trend === "down" ? (
                    <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <span className="w-3.5 h-3.5 text-gray-400 text-xs">—</span>
                  )}
                  <span className="text-sm font-mono font-medium text-gray-700">
                    {item.ratio}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 明日推薦潛力股 */}
        <div>
          <WatchlistCard stocks={recommendations} mode="after-market" />
        </div>
      </div>
    </div>
  );
}
