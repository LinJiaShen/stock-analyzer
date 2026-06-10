"use client";

import { Search, BarChart3 } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function ChipPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");

  // 模擬法人買賣超數據
  const legalData = [
    { date: "01/09", foreign: 5000, invest_trust: -2000, proprietary: 1000 },
    { date: "01/10", foreign: 3500, invest_trust: 1500, proprietary: -500 },
    { date: "01/13", foreign: 8000, invest_trust: -1000, proprietary: 2000 },
    { date: "01/14", foreign: 4500, invest_trust: 2500, proprietary: -1500 },
    { date: "01/15", foreign: 6000, invest_trust: 3000, proprietary: 500 },
  ];

  // 模擬融資融券數據
  const marginData = [
    { date: "01/09", margin: 12500, short: 3200 },
    { date: "01/10", margin: 12800, short: 3100 },
    { date: "01/13", margin: 13200, short: 2900 },
    { date: "01/14", margin: 13000, short: 2800 },
    { date: "01/15", margin: 13500, short: 2700 },
  ];

  // 模擬籌碼分析結果
  const chipResult = {
    score: 85,
    signal: "買入",
    dealer_flow: {
      foreign_net_buy: 27000,
      invest_trust_net_buy: 5000,
      proprietary_net_buy: 1500,
      foreign_consecutive_days: 5,
      invest_trust_consecutive_days: 2,
      trend: "外資連買",
      signal: "正面",
    },
    margin_trading: {
      margin_balance: 13500,
      short_balance: 2700,
      margin_net_buy: 1000,
      short_net_sell: 500,
      margin_ratio: 0.85,
      margin_trend: "增加",
      short_trend: "減少",
      signal: "偏多",
    },
    concentration: {
      concentration_ratio: 72.5,
      large_holder_trend: "集中",
      retail_ratio: 27.5,
      signal: "正面",
    },
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  const formatValue = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    const unit = Math.abs(val) >= 10000 ? "百萬" : "萬";
    const num = unit === "百萬" ? (val / 10000).toFixed(1) : val.toFixed(0);
    return `${sign}${num}${unit}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">籌碼分析</h1>
            <p className="text-sm text-gray-500">法人動向、融資融券、籌碼集中度追蹤</p>
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="輸入股票代碼 (例: 2330)"
              className="pl-9 pr-4 py-2 w-48 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            分析
          </button>
        </form>
      </div>

      {/* 評分摘要 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{selectedCode}</h2>
            <p className="text-sm text-gray-500">籌碼面綜合分析</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold text-green-600">{chipResult.score}</div>
              <div className="text-xs text-gray-500">綜合評分</div>
            </div>
            <div className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
              {chipResult.signal}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">外資買賣超</div>
            <div className="text-sm font-semibold text-green-600">
              {formatValue(chipResult.dealer_flow.foreign_net_buy)}
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">外資連買</div>
            <div className="text-sm font-semibold text-gray-900">
              {chipResult.dealer_flow.foreign_consecutive_days} 天
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">籌碼集中度</div>
            <div className="text-sm font-semibold text-gray-900">
              {chipResult.concentration.concentration_ratio}%
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">融資趨勢</div>
            <div className="text-sm font-semibold text-gray-900">{chipResult.margin_trading.margin_trend}</div>
          </div>
        </div>
      </div>

      {/* 三大法人買賣超 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">三大法人買賣超 (近 5 日)</h3>
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={legalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => formatValue(Number(value))}
              />
              <Legend />
              <Bar dataKey="foreign" name="外資" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="invest_trust" name="投信" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="proprietary" name="自營商" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 融資融券 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">融資融券餘額</h3>
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={marginData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => `${Number(value).toLocaleString()} 萬`}
              />
              <Legend />
              <Bar dataKey="margin" name="融資餘額" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="short" name="融券餘額" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 籌碼集中度 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">籌碼集中度分析</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {chipResult.concentration.concentration_ratio}%
            </div>
            <div className="text-sm text-gray-500">集中度</div>
            <div className="text-xs text-green-600 mt-1">{chipResult.concentration.large_holder_trend}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-orange-600 mb-1">
              {chipResult.concentration.retail_ratio}%
            </div>
            <div className="text-sm text-gray-500">散戶比例</div>
            <div className="text-xs text-gray-500 mt-1">持倉分散度</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {chipResult.dealer_flow.foreign_consecutive_days}
            </div>
            <div className="text-sm text-gray-500">外資連買天數</div>
            <div className="text-xs text-green-600 mt-1">{chipResult.dealer_flow.trend}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
