"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import RadarChartComponent from "@/components/decision/RadarChartComponent";

interface Holding {
  id: string;
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_cost: number | null;
  purchase_date: string | null;
  notes: string | null;
}

interface HoldingAnalysis {
  id: string;
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_percent: number;
  weight: number;
  score: number;
  signal: string;
  radar_data: {
    value: number;
    momentum: number;
    chip: number;
    growth: number;
    resistance: number;
  };
}

export default function HoldingsAnalysisPage() {
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await api.get("/api/holdings/");
      return res.data as Holding[];
    },
  });

  // 逐股抓取：最新收盤價 (kline)
  const priceQueries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["kline-latest", h.stock_code],
      queryFn: async () => {
        const res = await api.get(`/api/stocks/${h.stock_code}/kline?interval=1d&limit=2`);
        return res.data;
      },
      staleTime: 5 * 60 * 1000,
      enabled: holdings.length > 0,
    })),
  });

  // 逐股抓取：多因子評分
  const scoreQueries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["decision-score", h.stock_code],
      queryFn: async () => {
        const res = await api.get(`/api/decision/score/${h.stock_code}`);
        return res.data;
      },
      staleTime: 10 * 60 * 1000,
      enabled: holdings.length > 0,
    })),
  });

  // 逐股抓取：雷達圖數據
  const radarQueries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["radar", h.stock_code],
      queryFn: async () => {
        const res = await api.get(`/api/decision/radar/${h.stock_code}`);
        return res.data;
      },
      staleTime: 10 * 60 * 1000,
      enabled: holdings.length > 0,
    })),
  });

  // 逐股抓取：股票產業資訊
  const stockQueries = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["stock-info", h.stock_code],
      queryFn: async () => {
        const res = await api.get(`/api/stocks/${h.stock_code}`);
        return res.data;
      },
      staleTime: 60 * 60 * 1000,
      enabled: holdings.length > 0,
    })),
  });

  const analysisLoading =
    priceQueries.some((q) => q.isLoading) || scoreQueries.some((q) => q.isLoading);

  const finalAnalysis = useMemo<HoldingAnalysis[]>(() => {
    const raw = holdings.map((h, i) => {
      const bars = priceQueries[i]?.data?.data || [];
      const currentPrice =
        bars.length > 0 ? (bars[bars.length - 1].close ?? h.avg_cost ?? 0) : (h.avg_cost ?? 0);
      const avgCost = h.avg_cost || 0;
      const marketValue = currentPrice * h.quantity;
      const cost = avgCost * h.quantity;
      const pnl = marketValue - cost;
      const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

      const scoreData = scoreQueries[i]?.data;
      const score: number = scoreData?.total_score ?? 0;
      const signal = score >= 70 ? "買入" : score >= 50 ? "持有" : "觀察";

      const radarRaw = radarQueries[i]?.data?.radar;
      const radar_data = radarRaw ?? { value: 0, momentum: 0, chip: 0, growth: 0, resistance: 0 };

      return {
        id: h.id,
        stock_code: h.stock_code,
        stock_name: h.stock_name,
        quantity: h.quantity,
        avg_cost: avgCost,
        current_price: Math.round(currentPrice * 100) / 100,
        market_value: Math.round(marketValue),
        pnl: Math.round(pnl),
        pnl_percent: Math.round(pnlPercent * 10) / 10,
        weight: 0,
        score,
        signal,
        radar_data,
      };
    });

    const totalMV = raw.reduce((s, a) => s + a.market_value, 0);
    return raw.map((a) => ({
      ...a,
      weight: totalMV > 0 ? (a.market_value / totalMV) * 100 : 0,
    }));
  }, [holdings, priceQueries, scoreQueries, radarQueries]);

  // 計算組合總損益
  const totalCost = finalAnalysis.reduce((sum, a) => sum + a.avg_cost * a.quantity, 0);
  const totalValue = finalAnalysis.reduce((sum, a) => sum + a.market_value, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // 產業分佈 — 從 API 取得的股票產業資訊聚合
  const industryDistribution = useMemo(() => {
    const COLORS = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-orange-400", "bg-gray-400"];
    const map: Record<string, number> = {};
    finalAnalysis.forEach((a, i) => {
      const industry = stockQueries[i]?.data?.industry || "其他";
      map[industry] = (map[industry] || 0) + a.market_value;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({
        name,
        weight: total > 0 ? Math.round((value / total) * 100) : 0,
        color: COLORS[idx % COLORS.length],
      }));
  }, [finalAnalysis, stockQueries]);

  if (isLoading || analysisLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center py-16">
          <PieChart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">尚無持倉數據</h2>
          <p className="text-gray-500 mb-6">请先添加持股記錄，才能進行持倉分析</p>
          <Link
            href="/holdings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            前往持倉管理
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">持倉分析</h1>
            <p className="text-sm text-gray-500">個人持倉組合健診與績效追蹤</p>
          </div>
        </div>
        <Link
          href="/holdings"
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          持倉管理
        </Link>
      </div>

      {/* 組合總覽 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm text-gray-500 mb-1">持倉數量</div>
          <div className="text-2xl font-bold text-gray-900">{holdings.length}</div>
          <div className="text-xs text-gray-400 mt-1">檔股票</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm text-gray-500 mb-1">總市值</div>
          <div className="text-2xl font-bold text-gray-900">
            {totalValue.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">NTD</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm text-gray-500 mb-1">總成本</div>
          <div className="text-2xl font-bold text-gray-900">
            {totalCost.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">NTD</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm text-gray-500 mb-1">總損益</div>
          <div className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
            {totalPnl >= 0 ? "+" : ""}{totalPnl.toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${totalPnlPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
            {totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 個股分析列表 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">個股分析</h3>
          <div className="space-y-3">
            {finalAnalysis.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedStock === item.stock_code
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                }`}
                onClick={() => setSelectedStock(item.stock_code)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        item.pnl >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.stock_code}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{item.stock_name}</div>
                      <div className="text-xs text-gray-500">
                        持倉 {item.quantity} 股 | 均價 {item.avg_cost}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      ${item.current_price.toLocaleString()}
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        item.pnl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {item.pnl >= 0 ? "+" : ""}{item.pnl_percent.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* 評分與訊號 */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <div className="text-xs text-gray-500">評分</div>
                    <div className="text-sm font-bold text-blue-600">{item.score}</div>
                  </div>
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.signal === "買入"
                        ? "bg-green-100 text-green-700"
                        : item.signal === "賣出"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {item.signal}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <div className="text-xs text-gray-500">權重</div>
                    <div className="text-sm font-medium text-gray-700">
                      {item.weight.toFixed(1)}%
                    </div>
                  </div>
                  <Link
                    href={`/technical?code=${item.stock_code}`}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    詳細分析
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 產業分佈 + 選股雷達圖 */}
        <div className="space-y-6">
          {/* 產業分佈 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">產業分佈</h3>
            <div className="space-y-3">
              {industryDistribution.map((ind) => (
                <div key={ind.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{ind.name}</span>
                    <span className="font-medium text-gray-900">{ind.weight}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ind.color} rounded-full transition-all`}
                      style={{ width: `${ind.weight}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 選中股票的雷達圖 */}
          {selectedStock && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                {finalAnalysis.find((a) => a.stock_code === selectedStock)?.stock_name ||
                  selectedStock}
              </h3>
              <p className="text-xs text-gray-500 mb-4">六維度評分</p>
              <RadarChartComponent
                data={
                  finalAnalysis.find((a) => a.stock_code === selectedStock)?.radar_data || {
                    value: 50,
                    momentum: 50,
                    chip: 50,
                    growth: 50,
                    resistance: 50,
                  }
                }
                stockCode={selectedStock}
              />
            </div>
          )}
        </div>
      </div>

      {/* 風險警示 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
          風險警示
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {finalAnalysis
            .filter((a) => a.pnl_percent < -10 || a.score < 40)
            .map((item) => (
              <div
                key={item.id}
                className="p-4 bg-red-50 border border-red-200 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="font-medium text-red-700">
                    {item.stock_code} {item.stock_name}
                  </span>
                </div>
                <div className="text-sm text-red-600 space-y-1">
                  {item.pnl_percent < -10 && (
                    <div>虧損幅度達 {item.pnl_percent.toFixed(1)}%，建議評估停損</div>
                  )}
                  {item.score < 40 && (
                    <div>綜合評分 {item.score} 分，技術面偏弱</div>
                  )}
                </div>
              </div>
            ))}
          {finalAnalysis.filter((a) => a.pnl_percent < -10 || a.score < 40).length === 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-green-700 font-medium">目前持倉狀況良好，無重大風險警示</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
