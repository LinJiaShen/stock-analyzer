"use client";

import { Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import WatchlistCard, { type WatchlistStock } from "@/components/war-room/WatchlistCard";
import RankingBoard from "@/components/RankingBoard";
import PageHeader from "@/components/PageHeader";

const DEFAULT_STOCKS = ["2330", "2317", "2454", "2412", "2882", "2881", "3008", "2308", "1301", "2886"];

interface Holding {
  stock_code: string;
  stock_name: string;
}

interface ChipPoint {
  date: string;
  foreign_net_buy: number;
  invest_trust_net_buy: number;
  proprietary_net_buy: number;
  margin_balance: number;
  short_balance: number;
}

interface MarketSummary {
  taiex: { price: number; change: number; change_percent: number } | null;
  trade_date: string | null;
  gainers: Array<{ code: string; name: string; close: number; change_percent: number; volume_lots: number }>;
  losers: Array<{ code: string; name: string; close: number; change_percent: number; volume_lots: number }>;
  stats: { total: number; up: number; down: number; flat: number };
}

export default function AfterMarketPage() {
  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // 盤後市場摘要（大盤 + 漲跌排行）
  const { data: summary } = useQuery<MarketSummary>({
    queryKey: ["market-summary"],
    queryFn: async () => {
      const res = await api.get("/api/stocks/market-summary", { timeout: 60000 });
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // 持倉清單
  const { data: holdings = [] } = useQuery<Holding[]>({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await api.get("/api/holdings/");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 合併持倉 + 默認股票（去重，持倉優先，最多 10 筆）
  const stockCodes = useMemo(() => {
    const holdingCodes = holdings.map((h) => h.stock_code);
    return [...new Set([...holdingCodes, ...DEFAULT_STOCKS])].slice(0, 10);
  }, [holdings]);

  // 股票基本資訊
  const stockQueries = useQueries({
    queries: stockCodes.map((code) => ({
      queryKey: ["stock", code],
      queryFn: async () => {
        const res = await api.get(`/api/stocks/${code}`);
        return res.data as { code: string; name: string };
      },
      staleTime: 60 * 60 * 1000,
    })),
  });

  // 最新一日籌碼數據
  const chipQueries = useQueries({
    queries: stockCodes.map((code) => ({
      queryKey: ["chip-latest", code],
      queryFn: async () => {
        const res = await api.get(`/api/stocks/${code}/chip`, { params: { days: 1 } });
        const items: ChipPoint[] = res.data?.data ?? res.data ?? [];
        return Array.isArray(items) && items.length > 0 ? items[0] : null;
      },
      staleTime: 10 * 60 * 1000,
    })),
  });

  // 單位：張（chip_data 存的是張數）
  const formatValue = (val: number) => {
    if (!val && val !== 0) return "--";
    const sign = val >= 0 ? "+" : "";
    const abs = Math.abs(val);
    if (abs >= 10000) return `${sign}${(val / 10000).toFixed(1)}萬張`;
    return `${sign}${val.toFixed(0)}張`;
  };

  // 台股慣例：買超紅、賣超綠
  const valueColor = (val: number) => {
    if (val > 0) return "text-red-600";
    if (val < 0) return "text-green-600";
    return "text-gray-500";
  };

  // 組裝三大法人表格數據
  // 後端 chip endpoint 欄位：foreign_net / trust_net / proprietary_net
  const legalData = stockCodes.map((code, i) => {
    const stock = stockQueries[i].data;
    const chip = chipQueries[i].data;
    return {
      code,
      name: stock?.name ?? code,
      foreign: (chip as any)?.foreign_net ?? 0,
      invest_trust: (chip as any)?.trust_net ?? 0,
      proprietary: (chip as any)?.proprietary_net ?? 0,
    };
  });

  // 組裝明日推薦（法人合計買超前 3 名）
  const recommendations: WatchlistStock[] = useMemo(() => {
    return stockCodes
      .map((code, i) => {
        const stock = stockQueries[i].data;
        const chip = chipQueries[i].data;
        if (!chip || !stock) return null;
        const foreign = (chip as any).foreign_net ?? 0;
        const trust = (chip as any).trust_net ?? 0;
        const total = foreign + trust;
        if (total <= 0) return null;
        return {
          code,
          name: stock.name,
          signal: `法人合計買超 ${formatValue(total)}\n外資：${formatValue(foreign)}　投信：${formatValue(trust)}`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        // 依買超金額排序（取訊號第一行的數字比較）
        const getTotal = (sig: string | undefined) => {
          const match = sig?.match(/合計買超 ([+-]?\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        return getTotal(b.signal) - getTotal(a.signal);
      })
      .slice(0, 3);
  }, [stockCodes, stockQueries, chipQueries]);

  const isLoadingChip = chipQueries.some((q) => q.isLoading);

  return (
    <div>
      <PageHeader
        eyebrow="War Room・After-Market"
        title="盤後覆盤"
        description="大盤摘要、全市場排行、三大法人動向 — 收盤後的功課決定明天的勝率"
      >
        <div className="flex items-center gap-1.5 text-[13px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
          <Calendar className="w-3.5 h-3.5" />
          {today}・已收盤
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 今日大盤摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">加權指數</div>
          {summary?.taiex ? (
            <>
              <div className="text-xl font-bold font-mono text-gray-900">
                {summary.taiex.price.toLocaleString()}
              </div>
              <div className={`text-xs font-mono ${
                summary.taiex.change_percent > 0 ? "text-red-600" : summary.taiex.change_percent < 0 ? "text-green-600" : "text-gray-500"
              }`}>
                {summary.taiex.change_percent > 0 ? "+" : ""}{summary.taiex.change_percent}%
              </div>
            </>
          ) : (
            <div className="text-xl font-bold text-gray-300">--</div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">上漲家數</div>
          <div className="text-xl font-bold font-mono text-red-600">{summary?.stats?.up ?? "--"}</div>
          <div className="text-xs text-gray-400">追蹤池 {summary?.stats?.total ?? 0} 檔</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">下跌家數</div>
          <div className="text-xl font-bold font-mono text-green-600">{summary?.stats?.down ?? "--"}</div>
          <div className="text-xs text-gray-400">平盤 {summary?.stats?.flat ?? 0} 檔</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">資料日期</div>
          <div className="text-xl font-bold font-mono text-gray-900">{summary?.trade_date ?? "--"}</div>
          <div className="text-xs text-gray-400">每日 18:00 後更新</div>
        </div>
      </div>

      {/* 全市場排行榜（漲幅/跌幅/量/額） */}
      <div className="mb-6">
        <RankingBoard limit={20} compact />
      </div>

      {/* 三大法人買賣超 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">三大法人買賣超</h3>
          <span className="text-xs text-gray-400">持倉 + 熱門股</span>
        </div>
        {isLoadingChip ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : (
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 外資方向統計 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">外資方向統計</h3>
          {isLoadingChip ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-6 bg-gray-100 rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {legalData.map((item) => {
                const direction = item.foreign > 0 ? "up" : item.foreign < 0 ? "down" : "stable";
                const maxAbs = Math.max(...legalData.map((d) => Math.abs(d.foreign)), 1);
                const widthPct = Math.abs(item.foreign / maxAbs) * 100;
                return (
                  <div key={item.code} className="flex items-center gap-3">
                    <div className="w-20 flex-shrink-0">
                      <span className="text-sm font-bold text-gray-900">{item.code}</span>
                      <span className="text-xs text-gray-500 ml-1">{item.name}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            direction === "up" ? "bg-red-500" : direction === "down" ? "bg-green-500" : "bg-gray-400"
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 w-20 justify-end">
                      {direction === "up" ? (
                        <TrendingUp className="w-3.5 h-3.5 text-red-600" />
                      ) : direction === "down" ? (
                        <TrendingDown className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-gray-400 text-xs">—</span>
                      )}
                      <span className={`text-sm font-mono font-medium ${valueColor(item.foreign)}`}>
                        {formatValue(item.foreign)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 明日推薦潛力股 */}
        <div>
          <WatchlistCard stocks={recommendations} mode="after-market" />
        </div>
      </div>
      </div>
    </div>
  );
}
