"use client";

import { useState, useCallback, useMemo } from "react";
import { Clock, TrendingUp, TrendingDown, AlertTriangle, Search } from "lucide-react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import WatchlistCard, { type WatchlistStock } from "@/components/war-room/WatchlistCard";
import RankingBoard from "@/components/RankingBoard";
import PageHeader from "@/components/PageHeader";
import { useStockWebSocket } from "@/hooks/useStockWebSocket";
import { useIsMarketOpen } from "@/hooks/useIsMarketOpen";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const DEFAULT_STOCKS = ["2330", "2317", "2454", "2412", "2882", "2881", "3008", "2308", "1301", "2886"];

interface Holding {
  stock_code: string;
  stock_name: string;
}

export default function IntradayPage() {
  const now = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });

  const [searchInput, setSearchInput] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");
  const [klineData, setKlineData] = useState<Array<{ time: string; price: number }>>([]);
  const [openPrice, setOpenPrice] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const isMarketOpen = useIsMarketOpen();

  // 持倉清單
  const { data: holdings = [] } = useQuery<Holding[]>({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await api.get("/api/holdings/");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 合併持倉 + 默認股票，最多 8 筆
  const stockCodes = useMemo(() => {
    const holdingCodes = holdings.map((h) => h.stock_code);
    return [...new Set([selectedCode, ...holdingCodes, ...DEFAULT_STOCKS])].slice(0, 8);
  }, [holdings, selectedCode]);

  // 股票基本資訊（用於 watchlist 顯示名稱）
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

  // WebSocket 訊息處理（只取 1 分K，後端 interval=all 會同時推日K/1m/5m）
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === "candle_update" && message.data) {
      if (message.interval && message.interval !== "1m") return;
      const { close, open_time } = message.data;
      const timeStr = new Date(open_time).toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setCurrentPrice(close);
      setOpenPrice((prev) => prev ?? close);

      setKlineData((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.time === timeStr) {
          return [...prev.slice(0, -1), { time: timeStr, price: close }];
        }
        return [...prev, { time: timeStr, price: close }].slice(-60);
      });
    }
  }, []);

  const { connected, marketOpen } = useStockWebSocket({
    stockCode: selectedCode,
    interval: "1m",
    enabled: isMarketOpen,
    onMessage: handleWebSocketMessage,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const code = searchInput.trim().toUpperCase();
    if (code && code !== selectedCode) {
      setSelectedCode(code);
      setKlineData([]);
      setOpenPrice(null);
      setCurrentPrice(null);
    }
  };

  // 即時變動計算
  const priceChange = currentPrice && openPrice ? currentPrice - openPrice : null;
  const priceChangePct = priceChange && openPrice ? (priceChange / openPrice) * 100 : null;

  // 最新成交快照（market-summary movers 含全市場現價與漲跌幅）
  const { data: summary } = useQuery<any>({
    queryKey: ["market-summary"],
    queryFn: async () => (await api.get("/api/stocks/market-summary", { timeout: 60000 })).data,
    staleTime: 5 * 60 * 1000,
    refetchInterval: isMarketOpen ? 5 * 60 * 1000 : false,
  });
  const moverMap = useMemo(() => {
    const m = new Map<string, any>();
    (summary?.movers ?? []).forEach((x: any) => m.set(x.code, x));
    return m;
  }, [summary]);

  // Watchlist 關注個股
  const watchlistStocks: WatchlistStock[] = stockCodes.map((code, i) => {
    const mover = moverMap.get(code);
    return {
      code,
      name: stockQueries[i].data?.name ?? code,
      // 追蹤中的個股用 WS 即時價，其他用最新快照
      price: code === selectedCode && currentPrice != null ? currentPrice : mover?.close,
      change_percent: mover?.change_percent,
      status: code === selectedCode ? "追蹤中" : undefined,
    };
  });

  // 即時警示（空狀態 - 需要警示引擎 P3）
  const alerts: Array<{ id: string; type: "sell" | "breakout" | "buy"; stock: string; message: string; time: string }> = [];

  const alertIcon = {
    sell: { icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
    breakout: { icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
    buy: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
  };

  return (
    <div>
      <PageHeader
        eyebrow="War Room・Intraday"
        title="盤中實時追蹤"
        description="WebSocket 即時報價與分K更新，搭配關注清單同步監控"
      >
        <div className="flex items-center gap-3">
          {/* 搜尋個股 */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="代碼"
                className="pl-9 pr-3 py-1.5 w-28 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 text-sm"
            >
              追蹤
            </button>
          </form>
          {/* 連線/市場狀態 */}
          <div className="flex items-center gap-1.5 text-[13px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {connected ? "已連線" : "斷線"}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[13px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5" />
            {isMarketOpen ? "交易時間" : "非交易時間"}
          </div>
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 即時股價 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{selectedCode} 即時價格</h2>
            {currentPrice != null ? (
              <>
                <span className="text-2xl font-bold font-mono text-gray-900">
                  {currentPrice.toLocaleString()}
                </span>
                {priceChangePct != null && (
                  <span
                    className={`text-sm font-medium px-2 py-0.5 rounded ${
                      priceChangePct >= 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
                    }`}
                  >
                    {priceChangePct >= 0 ? "+" : ""}
                    {priceChangePct.toFixed(2)}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-2xl font-bold font-mono text-gray-400">
                {isMarketOpen ? "等待報價..." : "--"}
              </span>
            )}
          </div>
          {!isMarketOpen && (
            <div className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">
              台灣市場休市中（09:00–13:30）
            </div>
          )}
        </div>

        {/* 即時走勢圖 */}
        <div className="h-48 min-w-0">
          {klineData.length > 0 ? (
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
                <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-sm">{isMarketOpen ? "等待 WebSocket 資料..." : "開盤後自動啟動 WebSocket"}</div>
                <div className="text-xs mt-1 text-gray-300">交易時間：09:00–13:30（台北時間）</div>
              </div>
            </div>
          )}
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
            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const config = alertIcon[alert.type];
                  const Icon = config.icon;
                  return (
                    <div key={alert.id} className={`p-3 rounded-lg border ${config.bg} ${config.border}`}>
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
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">尚無即時警示</p>
                <p className="text-xs text-gray-300 mt-1">警示引擎即將推出</p>
              </div>
            )}
          </div>
        </div>

        {/* 關注個股 */}
        <div className="lg:col-span-2">
          <WatchlistCard stocks={watchlistStocks} mode="intraday" />
        </div>
      </div>

      {/* 全市場排行榜 */}
      <div className="mt-6">
        <RankingBoard limit={20} compact />
      </div>
      </div>
    </div>
  );
}
