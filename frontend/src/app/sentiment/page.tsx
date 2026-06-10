"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Brain, AlertCircle, Loader2, TrendingUp, TrendingDown, Minus, Newspaper } from "lucide-react";
import { useSentimentAnalysis, useStock } from "@/hooks/useApi";

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-400";
  if (s >= 65) return "text-green-400";
  if (s >= 50) return "text-yellow-400";
  if (s >= 35) return "text-orange-400";
  return "text-red-400";
}

function FearGreedMeter({ value }: { value: number }) {
  const label =
    value >= 75 ? "極度貪婪" :
    value >= 55 ? "貪婪" :
    value >= 45 ? "中性" :
    value >= 25 ? "恐懼" : "極度恐懼";
  const color =
    value >= 75 ? "#f59e0b" :
    value >= 55 ? "#84cc16" :
    value >= 45 ? "#94a3b8" :
    value >= 25 ? "#f97316" : "#ef4444";

  const deg = (value / 100) * 180 - 90;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full border-8 border-slate-800" />
        <div
          className="absolute bottom-0 left-1/2 w-1 h-12 origin-bottom rounded-full"
          style={{ backgroundColor: color, transform: `translateX(-50%) rotate(${deg}deg)` }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-700 border-2 border-slate-600" />
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function SentimentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={color}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full`} style={{ width: `${value * 100}%`, backgroundColor: color.includes("emerald") ? "#34d399" : color.includes("red") ? "#f87171" : "#94a3b8" }} />
      </div>
    </div>
  );
}

function SentimentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";
  const [inputCode, setInputCode] = useState(code);

  const { data, isLoading, error } = useSentimentAnalysis(code);
  const { data: stock } = useStock(code);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = inputCode.trim().toUpperCase();
    if (v) router.push(`/sentiment?code=${v}`);
  }

  const sentimentScore = data?.news_sentiment?.avg_sentiment_score ?? 0;
  const sentimentLabel =
    sentimentScore >= 0.3 ? "偏多" :
    sentimentScore >= -0.3 ? "中性" : "偏空";
  const sentimentColor =
    sentimentScore >= 0.3 ? "text-emerald-400" :
    sentimentScore >= -0.3 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-400" />
          情緒分析
        </h1>
        <p className="text-slate-400 text-sm">LLM 驅動的新聞與論壇情緒評分，感知市場溫度</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="輸入股票代碼 (如 2330)"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition-colors">
          查詢
        </button>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />分析中...
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          無法取得 {code} 的情緒分析資料，請確認股票代碼或稍後再試
        </div>
      )}

      {!code && !isLoading && (
        <div className="text-center py-24">
          <Brain className="w-12 h-12 text-slate-800 mx-auto mb-4" />
          <p className="text-slate-500">請輸入股票代碼以開始情緒分析</p>
        </div>
      )}

      {data && !isLoading && (
        <>
          {stock && (
            <div className="mb-6 flex items-center gap-3">
              <span className="text-white font-semibold text-lg">{stock.name}</span>
              <span className="text-slate-500 text-sm">{code}</span>
              <span className={`text-sm font-semibold px-3 py-0.5 rounded-full border bg-slate-800 border-slate-700 ${scoreColor(data.score)}`}>
                情緒評分 {data.score}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Overall Sentiment Score */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-4">
              <div className="text-sm font-medium text-slate-400">整體情緒</div>
              <div className={`text-5xl font-bold ${sentimentColor}`}>
                {sentimentScore >= 0 ? "+" : ""}{(sentimentScore * 100).toFixed(0)}
              </div>
              <span className={`px-3 py-1 rounded-full border text-sm font-medium ${
                sentimentScore >= 0.3 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : sentimentScore >= -0.3 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                : "text-red-400 bg-red-400/10 border-red-400/20"
              }`}>
                {sentimentScore >= 0.3 ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : sentimentScore >= -0.3 ? <Minus className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                {sentimentLabel}
              </span>
              <div className="text-xs text-slate-500">分析 {data.news_sentiment.news_count} 則新聞</div>
            </div>

            {/* News Sentiment */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-2 mb-5">
                <Newspaper className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">新聞情緒分布</span>
              </div>
              <div className="space-y-3 mb-5">
                <SentimentBar label="正面" value={data.news_sentiment.positive_ratio} color="text-emerald-400" />
                <SentimentBar label="中性" value={data.news_sentiment.neutral_ratio} color="text-slate-400" />
                <SentimentBar label="負面" value={data.news_sentiment.negative_ratio} color="text-red-400" />
              </div>
              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">新聞趨勢</span>
                  <span className={data.news_sentiment.trend?.includes("正") || data.news_sentiment.trend?.includes("樂") ? "text-emerald-400" : data.news_sentiment.trend?.includes("負") || data.news_sentiment.trend?.includes("悲") ? "text-red-400" : "text-yellow-400"}>
                    {data.news_sentiment.trend}
                  </span>
                </div>
              </div>
            </div>

            {/* Fear/Greed */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="text-sm font-medium text-white mb-5">恐懼貪婪指數</div>
              <div className="flex justify-center mb-4">
                <FearGreedMeter value={Math.round(data.market_sentiment.fear_greed_index * 100)} />
              </div>
              <div className="space-y-2.5 pt-4 border-t border-slate-800">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">整體市場</span>
                  <span className="text-white">{(data.market_sentiment.overall_score * 100).toFixed(0)} 分</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">市場訊號</span>
                  <span className={data.market_sentiment.signal?.includes("多") ? "text-emerald-400" : data.market_sentiment.signal?.includes("空") ? "text-red-400" : "text-yellow-400"}>
                    {data.market_sentiment.signal}
                  </span>
                </div>
              </div>
            </div>

            {/* Keywords */}
            {data.news_sentiment.keywords?.length > 0 && (
              <div className="lg:col-span-3 p-6 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="text-sm font-medium text-white mb-4">熱門關鍵詞</div>
                <div className="flex flex-wrap gap-2">
                  {data.news_sentiment.keywords.map((kw: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-sm text-slate-300">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SentimentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />載入中...
        </div>
      }
    >
      <SentimentContent />
    </Suspense>
  );
}
