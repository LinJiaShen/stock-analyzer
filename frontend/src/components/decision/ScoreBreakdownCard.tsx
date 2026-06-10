import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface ScoreBreakdown {
  technical: number;
  chip: number;
  fundamental: number;
  sentiment: number;
}

interface Props {
  scores: ScoreBreakdown;
  totalScore: number;
  loading?: boolean;
}

const levelConfig = {
  high: { label: "強勢偏多", color: "text-green-700", bg: "bg-green-50" },
  medium: { label: "偏多", color: "text-blue-700", bg: "bg-blue-50" },
  low: { label: "偏空", color: "text-red-700", bg: "bg-red-50" },
};

function getLevel(score: number) {
  if (score >= 75) return levelConfig.high;
  if (score >= 50) return levelConfig.medium;
  return levelConfig.low;
}

export default function ScoreBreakdownCard({ scores, totalScore, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">各維度評分</h3>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex justify-between mb-1">
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-10" />
              </div>
              <div className="h-2 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const level = getLevel(totalScore);

  const items = [
    { label: "技術面", score: scores.technical },
    { label: "籌碼面", score: scores.chip },
    { label: "基本面", score: scores.fundamental },
    { label: "情緒面", score: scores.sentiment },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">綜合評分</h3>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-blue-600">{totalScore}</span>
          <span className={`text-sm font-medium px-2 py-0.5 rounded ${level.color} ${level.bg}`}>
            {level.label}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const icon =
            item.score >= 75 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : item.score >= 50 ? (
              <Minus className="w-4 h-4 text-yellow-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            );

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {icon}
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-mono font-medium text-gray-900">
                  {item.score}/100
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.score >= 75
                      ? "bg-green-500"
                      : item.score >= 50
                      ? "bg-blue-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${item.score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
