import { Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

  // 盤前數據 API
  const { data: premarket, isLoading: loadingPremarket } = useQuery({
    queryKey: ["premarket"],
    queryFn: async () => {
      const res = await api.get("/stocks/pre-market");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: false, // 暫時使用模擬數據
  });

  // 模擬數據 - 國際指數
  const indices: IndexData[] = [
    { name: "道瓊工業", value: 39842, change: 198, change_percent: 0.50 },
    { name: "納斯達克", value: 17412, change: 138, change_percent: 0.80 },
    { name: "日經 225", value: 38244, change: 115, change_percent: 0.30 },
    { name: "恆生指數", value: 18562, change: -37, change_percent: -0.20 },
    { name: "滬深 300", value: 3421, change: 28, change_percent: 0.82 },
  ];

  // 模擬數據 - ADR
  const adrList: ADRData[] = [
    { ticker: "GDS", name: "軟銀集團", price: 87.5, change: 1.05, change_percent: 1.22 },
    { ticker: "ASML", name: "ASML", price: 712.3, change: -3.56, change_percent: -0.50 },
    { ticker: "TSM", name: "台積電", price: 142.8, change: 2.1, change_percent: 1.49 },
    { ticker: "UMC", name: "聯電", price: 14.25, change: 0.15, change_percent: 1.06 },
  ];

  // 模擬數據 - 關注清單
  const watchlist: WatchlistStock[] = [
    {
      code: "2330",
      name: "台積電",
      gap_probability: 65,
      resistance: 580,
      support: 560,
    },
    {
      code: "2454",
      name: "聯電",
      gap_probability: 40,
      resistance: 42,
      support: 39,
    },
    {
      code: "3034",
      name: "台積電封測",
      gap_probability: 55,
      resistance: 125,
      support: 118,
    },
  ];

  // 模擬數據 - 情緒預警
  const alerts: SentimentAlert[] = [
    {
      id: "1",
      level: "warning",
      title: "半導體產業供應鏈消息",
      description: "美國出口管制可能影響先進製程設備交付，建議關注相關個股。",
      affected_stocks: ["2330", "2454", "3034"],
    },
    {
      id: "2",
      level: "info",
      title: "外資連買台積電",
      description: "外資連續三週淨買入台積電，累計買超 15 億股。",
      affected_stocks: ["2330"],
    },
    {
      id: "3",
      level: "success",
      title: "AI 晶片需求強勁",
      description: "全球 AI 晶片需求持續增長，封測產業受惠明顯。",
      affected_stocks: ["3034", "6239"],
    },
  ];

  // 模擬數據 - 早報新聞
  const news: NewsItem[] = [
    {
      id: "1",
      title: "台積電 2nm 製程良率提升，預計 2025 年量產",
      source: "經濟日報",
      timestamp: "06:30",
      sentiment: "positive",
    },
    {
      id: "2",
      title: "Fed 暗示今年可能降息兩次，市場樂觀看待",
      source: "彭博社",
      timestamp: "05:45",
      sentiment: "positive",
    },
    {
      id: "3",
      title: "中國半導體自給率目標 2027 年達 70%",
      source: "財新",
      timestamp: "04:20",
      sentiment: "neutral",
    },
    {
      id: "4",
      title: "日圓持續貶值，日本出口股受惠",
      source: "日經新聞",
      timestamp: "03:15",
      sentiment: "neutral",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">盤前戰情室</h1>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            <Calendar className="w-4 h-4" />
            {today}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-gray-600">盤前準備中</span>
        </div>
      </div>

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
  );
}
