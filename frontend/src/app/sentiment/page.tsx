"use client";

import { Search, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useState } from "react";
import { useSentimentAnalysis } from "@/hooks/useApi";

const TREND_LABELS: Record<string, string> = {
  improving: "上升",
  worsening: "下降",
  stable: "穩定",
};

const FEAR_GREED_LABELS = (idx: number) => {
  if (idx <= 20) return "極度恐懼";
  if (idx <= 40) return "恐懼";
  if (idx <= 60) return "中性";
  if (idx <= 80) return "貪婪";
  return "極度貪婪";
};

export default function SentimentPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");

  const { data: sentimentData, isLoading, isError } = useSentimentAnalysis(selectedCode);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  const news = sentimentData?.news_sentiment;
  const market = sentimentData?.market_sentiment;

  const sentimentColor = {
    positive: "#22c55e",
    neutral: "#94a3b8",
    negative: "#ef4444",
  };

  return (
    <div>
      <PageHeader
        eyebrow="Sentiment"
        title="情緒分析"
        description="多家媒體新聞聚合，本地 LLM 逐則評分利多利空，市場貪婪恐懼一目了然"
      >
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="輸入股票代碼（例：2330）"
              className="pl-10 pr-4 py-2 w-52 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium"
          >
            分析
          </button>
        </form>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 載入中 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="ml-3 text-gray-500">LLM 情緒分析中...</span>
        </div>
      )}

      {/* 錯誤 */}
      {isError && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-600">
          查無 {selectedCode} 的情緒分析資料，請確認代碼是否正確。
        </div>
      )}

      {/* 評分摘要 */}
      {sentimentData && !isLoading && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedCode}</h2>
                <p className="text-sm text-gray-500">情緒面綜合分析</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-3xl font-bold text-purple-600">{sentimentData.score}</div>
                  <div className="text-xs text-gray-500">情緒評分</div>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                    sentimentData.signal === "買入" || sentimentData.signal === "positive"
                      ? "bg-green-100 text-green-700"
                      : sentimentData.signal === "賣出" || sentimentData.signal === "negative"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {sentimentData.signal}
                </div>
              </div>
            </div>

            {news && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">正面比例</div>
                  <div className="text-sm font-semibold text-green-600">
                    {(news.positive_ratio * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">負面比例</div>
                  <div className="text-sm font-semibold text-red-600">
                    {(news.negative_ratio * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">新聞數量</div>
                  <div className="text-sm font-semibold text-gray-900">{news.news_count} 則</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">恐懼貪婪指數</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {market?.fear_greed_index ?? "--"}{" "}
                    {market ? `(${FEAR_GREED_LABELS(market.fear_greed_index)})` : ""}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 情緒比例分布 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">新聞情緒分布</h3>
              {news ? (
                <div className="space-y-4">
                  {/* 正面 */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-green-600 font-medium">正面</span>
                      <span className="text-gray-600">{(news.positive_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${news.positive_ratio * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* 中性 */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500 font-medium">中性</span>
                      <span className="text-gray-600">{(news.neutral_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-400 transition-all"
                        style={{ width: `${news.neutral_ratio * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* 負面 */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-red-600 font-medium">負面</span>
                      <span className="text-gray-600">{(news.negative_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all"
                        style={{ width: `${news.negative_ratio * 100}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    趨勢：{TREND_LABELS[news.trend] ?? news.trend} · 共分析 {news.news_count} 則新聞
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">無情緒分布資料</p>
              )}

              {/* 歷史趨勢說明 */}
              <div className="mt-5 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">
                  歷史情緒趨勢（多日比較）即將推出，目前僅支援即時分析
                </p>
              </div>
            </div>

            {/* 熱門關鍵詞 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">熱門關鍵詞</h3>
              {news?.keywords && news.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {news.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">無關鍵詞資料</p>
              )}
            </div>
          </div>

          {/* 近期新聞（含個別情緒評分） */}
          {!!sentimentData.news && sentimentData.news.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                近期新聞與 LLM 評分（{sentimentData.news.length} 則）
              </h3>
              <div className="space-y-2">
                {sentimentData.news.map((n: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                      n.sentiment_score > 0.1 ? "bg-green-100 text-green-700" :
                      n.sentiment_score < -0.1 ? "bg-red-100 text-red-700" :
                      "bg-gray-200 text-gray-600"
                    }`}>
                      {n.sentiment_score > 0 ? "+" : ""}{n.sentiment_score.toFixed(1)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900">{n.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {n.source}
                        {n.time && ` · ${new Date(n.time).toLocaleDateString("zh-TW")}`}
                        {n.summary && <span className="text-purple-500"> · {n.summary}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {sentimentData.method && (
                <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3 mt-3">
                  分析方法：{sentimentData.method}
                </p>
              )}
            </div>
          )}

          {/* 恐懼貪婪指數 */}
          {market && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">市場恐懼貪婪指數</h3>
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                      style={{ width: "100%" }}
                    />
                    {/* 指針 */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-gray-800"
                      style={{ left: `${market.fear_greed_index}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>極度恐懼</span>
                    <span>恐懼</span>
                    <span>中性</span>
                    <span>貪婪</span>
                    <span>極度貪婪</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-600">{market.fear_greed_index}</div>
                  <div className="text-sm text-gray-500 mt-1">{FEAR_GREED_LABELS(market.fear_greed_index)}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
