import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface ScoreBreakdown {
  technical: number;
  chip: number;
  fundamental: number;
  sentiment: number;
}

export interface ScoreExplanations {
  technical?: string;
  chip?: string;
  fundamental?: string;
  sentiment?: string;
}

interface Props {
  scores: ScoreBreakdown;
  totalScore: number;
  loading?: boolean;
  explanations?: ScoreExplanations;
}

// 台股慣例：紅=偏多、綠=偏空
const levelConfig = {
  high: { label: "強勢偏多", color: "text-red-700", bg: "bg-red-50" },
  medium: { label: "偏多", color: "text-orange-700", bg: "bg-orange-50" },
  neutral: { label: "中性", color: "text-gray-600", bg: "bg-gray-100" },
  low: { label: "偏空", color: "text-green-700", bg: "bg-green-50" },
};

function getLevel(score: number) {
  if (score >= 75) return levelConfig.high;
  if (score >= 60) return levelConfig.medium;
  if (score >= 40) return levelConfig.neutral;
  return levelConfig.low;
}

// 一句話白話解讀（投資小白導向）
function getPlainReading(score: number): string {
  if (score >= 75) return "各面向都偏正面，市場目前對這檔股票相當有信心，但高分不代表立刻買 — 留意是否已漲一段。";
  if (score >= 60) return "整體偏正面，具備投資吸引力，可搭配下方操作建議的進出場價位規劃。";
  if (score >= 40) return "多空力道接近、方向不明，新手此時最適合「觀察不出手」，等分數突破 60 或跌破 40 再行動。";
  if (score >= 25) return "偏弱訊號較多，持有者該檢視停損計畫，空手者不建議進場接刀。";
  return "各面向明顯偏空，遠離為上 — 便宜不等於安全。";
}

export default function ScoreBreakdownCard({ scores, totalScore, loading = false, explanations }: Props) {
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
    { label: "技術面", score: scores.technical, explanation: explanations?.technical },
    { label: "籌碼面", score: scores.chip, explanation: explanations?.chip },
    { label: "基本面", score: scores.fundamental, explanation: explanations?.fundamental },
    { label: "情緒面", score: scores.sentiment, explanation: explanations?.sentiment },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">綜合評分</h3>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-blue-600">{totalScore}</span>
          <span className={`text-sm font-medium px-2 py-0.5 rounded ${level.color} ${level.bg}`}>
            {level.label}
          </span>
        </div>
      </div>

      {/* 一句話白話解讀 */}
      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
        {getPlainReading(totalScore)}
      </p>

      <div className="space-y-4">
        {items.map((item) => {
          const icon =
            item.score >= 75 ? (
              <TrendingUp className="w-4 h-4 text-red-600" />
            ) : item.score >= 50 ? (
              <Minus className="w-4 h-4 text-yellow-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-green-600" />
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
                      ? "bg-red-500"
                      : item.score >= 50
                      ? "bg-blue-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${item.score}%` }}
                />
              </div>
              {item.explanation && (
                <p className="text-xs text-gray-400 mt-1">{item.explanation}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-300 mt-4 pt-3 border-t border-gray-100">
        加權方式：技術 30%・籌碼 20%・K線形態 20%・基本 15%・情緒 15%，滿分 100
      </p>
    </div>
  );
}
