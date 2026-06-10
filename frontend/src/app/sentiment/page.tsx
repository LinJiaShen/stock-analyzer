"use client";

import { Search, Brain } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function SentimentPage() {
  const [searchCode, setSearchCode] = useState("2330");
  const [selectedCode, setSelectedCode] = useState("2330");

  // 模擬新聞情緒數據
  const newsSentimentData = [
    { date: "01/09", positive: 65, neutral: 25, negative: 10 },
    { date: "01/10", positive: 70, neutral: 20, negative: 10 },
    { date: "01/13", positive: 80, neutral: 15, negative: 5 },
    { date: "01/14", positive: 75, neutral: 18, negative: 7 },
    { date: "01/15", positive: 72, neutral: 20, negative: 8 },
  ];

  // 模擬熱門關鍵詞
  const keywords = [
    { word: "AI 晶片", count: 156, sentiment: "positive" },
    { word: "先進製程", count: 98, sentiment: "positive" },
    { word: "出口管制", count: 67, sentiment: "negative" },
    { word: "營收成長", count: 89, sentiment: "positive" },
    { word: "外資買超", count: 75, sentiment: "positive" },
    { word: "地緣政治", count: 45, sentiment: "negative" },
  ];

  // 模擬情緒分析結果
  const sentimentResult = {
    score: 75,
    signal: "正面",
    news_sentiment: {
      positive_ratio: 0.72,
      negative_ratio: 0.08,
      neutral_ratio: 0.20,
      avg_sentiment_score: 0.68,
      trend: "上升",
      signal: "正面",
      news_count: 128,
      keywords: ["AI 晶片", "先進製程", "營收成長"],
    },
    market_sentiment: {
      overall_score: 72,
      fear_greed_index: 65,
      signal: "貪婪",
    },
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedCode(searchCode);
  };

  const sentimentColor = {
    positive: "#22c55e",
    neutral: "#94a3b8",
    negative: "#ef4444",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">情緒分析</h1>
            <p className="text-sm text-gray-500">LLM 驅動的新聞與論壇情緒評分</p>
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
              className="pl-9 pr-4 py-2 w-48 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
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
            <p className="text-sm text-gray-500">情緒面綜合分析</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold text-purple-600">{sentimentResult.score}</div>
              <div className="text-xs text-gray-500">情緒評分</div>
            </div>
            <div className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
              {sentimentResult.signal}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">正面比例</div>
            <div className="text-sm font-semibold text-green-600">
              {(sentimentResult.news_sentiment.positive_ratio * 100).toFixed(0)}%
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">負面比例</div>
            <div className="text-sm font-semibold text-red-600">
              {(sentimentResult.news_sentiment.negative_ratio * 100).toFixed(0)}%
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">新聞數量</div>
            <div className="text-sm font-semibold text-gray-900">
              {sentimentResult.news_sentiment.news_count} 則
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">恐懼貪婪指數</div>
            <div className="text-sm font-semibold text-gray-900">
              {sentimentResult.market_sentiment.fear_greed_index} ({sentimentResult.market_sentiment.signal})
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 新聞情緒趨勢 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">新聞情緒趨勢</h3>
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={newsSentimentData}>
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
                />
                <Bar dataKey="positive" name="正面" radius={[4, 4, 0, 0]}>
                  {newsSentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={sentimentColor.positive} />
                  ))}
                </Bar>
                <Bar dataKey="neutral" name="中性" radius={[4, 4, 0, 0]}>
                  {newsSentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={sentimentColor.neutral} />
                  ))}
                </Bar>
                <Bar dataKey="negative" name="負面" radius={[4, 4, 0, 0]}>
                  {newsSentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={sentimentColor.negative} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 熱門關鍵詞 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">熱門關鍵詞</h3>
          <div className="space-y-3">
            {keywords.map((kw) => (
              <div key={kw.word} className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    kw.sentiment === "positive"
                      ? "bg-green-500"
                      : kw.sentiment === "negative"
                      ? "bg-red-500"
                      : "bg-gray-400"
                  }`}
                />
                <span className="text-sm text-gray-900 font-medium flex-1">{kw.word}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        kw.sentiment === "positive"
                          ? "bg-green-500"
                          : kw.sentiment === "negative"
                          ? "bg-red-500"
                          : "bg-gray-400"
                      }`}
                      style={{ width: `${(kw.count / 156) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{kw.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 恐懼貪婪指數 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">市場恐懼貪婪指數</h3>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                style={{ width: "100%" }}
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
            <div className="text-4xl font-bold text-purple-600">
              {sentimentResult.market_sentiment.fear_greed_index}
            </div>
            <div className="text-sm text-gray-500 mt-1">{sentimentResult.market_sentiment.signal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
