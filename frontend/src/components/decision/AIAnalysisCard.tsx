"use client";

import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface AIAnalysis {
  source: "llm" | "rule";
  model: string | null;
  summary: string;
  bullish_points: string[];
  bearish_points: string[];
  risks: string[];
  suggestion: string;
  perspective: string;
}

interface Props {
  stockCode: string;
}

export default function AIAnalysisCard({ stockCode }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<AIAnalysis>({
    queryKey: ["ai-analysis", stockCode],
    queryFn: async () => {
      // LLM 推論可能需要 1-2 分鐘（首次冷啟動），快取後很快
      const res = await api.get(`/api/decision/ai-analysis/${stockCode}`, { timeout: 180000 });
      return res.data;
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <h3 className="text-base font-semibold text-gray-900">AI 分析</h3>
          {data && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              data.source === "llm" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"
            }`}>
              {data.source === "llm" ? `LLM · ${data.model}` : "規則式"}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg"
          title="重新分析"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">AI 分析中（首次約需 1-2 分鐘）...</span>
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-gray-400 py-4">AI 分析暫時無法使用，請稍後再試</p>
      ) : (
        <div className="space-y-4">
          {/* 總結 */}
          <p className="text-sm text-gray-800 leading-relaxed bg-violet-50 border border-violet-100 rounded-lg p-3">
            {data.summary}
          </p>

          {/* 多空觀點 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-2">
                <TrendingUp className="w-3.5 h-3.5" /> 利多觀點
              </div>
              <ul className="space-y-1.5">
                {data.bullish_points.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-green-500 flex-shrink-0">▲</span>{p}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-2">
                <TrendingDown className="w-3.5 h-3.5" /> 利空觀點
              </div>
              <ul className="space-y-1.5">
                {data.bearish_points.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-red-500 flex-shrink-0">▼</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 風險提醒 */}
          {data.risks?.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> 注意事項
              </div>
              <ul className="space-y-1">
                {data.risks.map((r, i) => (
                  <li key={i} className="text-xs text-amber-800">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 操作建議 + 視角 */}
          <div className="flex items-start justify-between gap-4 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-700 flex-1">
              <span className="font-medium">建議：</span>{data.suggestion}
            </p>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{data.perspective}</span>
          </div>

          <p className="text-[10px] text-gray-300">
            AI 生成內容僅供研究參考，不構成投資建議
          </p>
        </div>
      )}
    </div>
  );
}
