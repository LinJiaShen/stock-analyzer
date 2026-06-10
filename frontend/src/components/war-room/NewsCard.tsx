import { Newspaper } from "lucide-react";

export interface NewsItem {
  id: string;
  title: string;
  source?: string;
  timestamp?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

interface Props {
  news: NewsItem[];
  loading?: boolean;
}

export default function NewsCard({ news, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Newspaper className="w-4 h-4" />
          早報新聞
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sentimentColor = {
    positive: "text-green-600 bg-green-50",
    negative: "text-red-600 bg-red-50",
    neutral: "text-gray-600 bg-gray-100",
  };

  const sentimentLabel = {
    positive: "正面",
    negative: "負面",
    neutral: "中性",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Newspaper className="w-4 h-4" />
        早報新聞
      </h3>
      <div className="space-y-3">
        {news.map((item) => (
          <div key={item.id} className="p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-900 font-medium leading-relaxed flex-1">
                {item.title}
              </p>
              {item.sentiment && (
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${sentimentColor[item.sentiment]}`}>
                  {sentimentLabel[item.sentiment]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {item.source && <span className="text-xs text-gray-500">{item.source}</span>}
              {item.timestamp && <span className="text-xs text-gray-400">{item.timestamp}</span>}
            </div>
          </div>
        ))}

        {news.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">暫無新聞</div>
        )}
      </div>
    </div>
  );
}
