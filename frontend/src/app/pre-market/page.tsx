"use client";

import { Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePreMarket } from "@/hooks/useApi";
import PageHeader from "@/components/PageHeader";
import InternationalIndexCard from "@/components/war-room/InternationalIndexCard";
import WatchlistCard from "@/components/war-room/WatchlistCard";
import ADRCard from "@/components/war-room/ADRCards";
import SentimentAlertCard from "@/components/war-room/SentimentAlertCard";
import NewsCard from "@/components/war-room/NewsCard";
import type { IndexData } from "@/components/war-room/InternationalIndexCard";
import type { WatchlistStock } from "@/components/war-room/WatchlistCard";
import type { ADRData } from "@/components/war-room/ADRCards";
import type { SentimentAlert } from "@/components/war-room/SentimentAlertCard";
import type { NewsItem } from "@/components/war-room/NewsCard";

export default function PreMarketPage() {
  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const { data: premarket, isLoading: loadingPremarket } = usePreMarket();

  // 將後端回傳的國際指數映射到組件期望的格式
  // 後端可能回傳 price 欄位，也可能是 value；一律統一為 value
  const indices: IndexData[] = (premarket?.international_indices ?? []).map((idx: any) => ({
    name: idx.name,
    value: idx.value ?? idx.price ?? 0,
    change: idx.change ?? 0,
    change_percent: idx.change_percent ?? 0,
  }));

  const adrList: ADRData[] = (premarket?.adr_performance ?? []).map((adr: any) => ({
    ticker: adr.ticker ?? adr.symbol ?? "",
    name: adr.name ?? "",
    price: adr.price ?? adr.regular_market_price ?? 0,
    change: adr.change ?? adr.regular_market_change ?? 0,
    change_percent: adr.change_percent ?? adr.regular_market_change_percent ?? 0,
  }));

  // 全球早報新聞 + 情緒預警
  const { data: globalNews } = useQuery<{ news: NewsItem[]; alerts: SentimentAlert[] }>({
    queryKey: ["global-news"],
    queryFn: async () => (await api.get("/api/analysis/news/global", { timeout: 120000 })).data,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const news: NewsItem[] = globalNews?.news ?? [];
  const alerts: SentimentAlert[] = globalNews?.alerts ?? [];

  // 當日關注清單：追蹤清單 + 最新收盤漲跌（需登入，未登入顯示空狀態）
  const { data: watchlistItems = [] } = useQuery<Array<{ stock_code: string }>>({
    queryKey: ["watchlist"],
    queryFn: async () => (await api.get("/api/watchlist/")).data,
    retry: false,
  });
  const { data: summary } = useQuery<any>({
    queryKey: ["market-summary"],
    queryFn: async () => (await api.get("/api/stocks/market-summary", { timeout: 60000 })).data,
    staleTime: 10 * 60 * 1000,
  });

  const priceMap = new Map<string, any>();
  (summary?.movers ?? [...(summary?.gainers ?? []), ...(summary?.losers ?? [])]).forEach((m: any) => priceMap.set(m.code, m));

  const watchlist: WatchlistStock[] = watchlistItems.map((w) => {
    const m = priceMap.get(w.stock_code);
    return {
      code: w.stock_code,
      name: m?.name ?? w.stock_code,
      price: m?.close,
      change_percent: m?.change_percent,
      signal: m ? `昨收 ${m.close}（${m.change_percent > 0 ? "+" : ""}${m.change_percent}%）` : "追蹤中",
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow="War Room・Pre-Market"
        title="盤前戰情室"
        description="隔夜美股、台股 ADR、全球早報與情緒預警 — 開盤前 10 分鐘掌握定調"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <Calendar className="w-3.5 h-3.5" />
            {today}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-slate-400 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            盤前準備中
          </div>
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 主要內容 - 左右兩欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左欄 - 國際資訊 */}
        <div className="space-y-6">
          <InternationalIndexCard indices={indices} loading={loadingPremarket} />
          <ADRCard adrList={adrList} loading={loadingPremarket} />
          <NewsCard news={news} loading={loadingPremarket} />
        </div>

        {/* 右欄 - 關注清單 + 預警 */}
        <div className="space-y-6">
          <WatchlistCard stocks={watchlist} loading={loadingPremarket} mode="pre-market" />
          <SentimentAlertCard alerts={alerts} loading={loadingPremarket} />
        </div>
      </div>
      </div>
    </div>
  );
}
