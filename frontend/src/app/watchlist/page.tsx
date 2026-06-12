"use client";

import { useState } from "react";
import { Star, Trash2, Plus, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useScore } from "@/hooks/useApi";
import PageHeader from "@/components/PageHeader";

interface WatchlistItem {
  id: string;
  stock_code: string;
  note: string | null;
  added_at?: string;
}

interface ScoreData {
  total_score: number;
  technical_score: number;
  chip_score: number;
  fundamental_score: number;
  sentiment_score: number;
}

const SCORE_COLOR = (s: number) => {
  if (s >= 70) return "text-green-600";
  if (s >= 50) return "text-yellow-600";
  return "text-red-600";
};

const SCORE_BG = (s: number) => {
  if (s >= 70) return "bg-green-50 border-green-200";
  if (s >= 50) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
};

function WatchlistScoreRow({ item }: { item: WatchlistItem }) {
  const { data: score, isLoading } = useScore(item.stock_code);
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/watchlist/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  return (
    <div className={`rounded-xl border p-4 ${score ? SCORE_BG(score.total_score) : "bg-white border-gray-200"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
              score ? SCORE_BG(score.total_score) : "bg-gray-100"
            }`}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            ) : score ? (
              <span className={SCORE_COLOR(score.total_score)}>{score.total_score.toFixed(0)}</span>
            ) : (
              <span className="text-gray-300 text-sm">--</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{item.stock_code}</span>
              <Link
                href={`/stock/${item.stock_code}`}
                className="text-blue-500 hover:text-blue-700"
                title="前往個股頁"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            {item.note && <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>}
          </div>
        </div>

        <button
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="從追蹤清單移除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {score && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: "技術", val: score.technical_score },
            { label: "籌碼", val: score.chip_score },
            { label: "基本", val: score.fundamental_score },
            { label: "情緒", val: score.sentiment_score },
          ].map((dim) => (
            <div key={dim.label} className="text-center">
              <div className="text-xs text-gray-500">{dim.label}</div>
              <div className={`text-sm font-semibold ${SCORE_COLOR(dim.val)}`}>
                {dim.val.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WatchlistPage() {
  const [addCode, setAddCode] = useState("");
  const [addNote, setAddNote] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: watchlist = [], isLoading, isError } = useQuery<WatchlistItem[]>({
    queryKey: ["watchlist"],
    queryFn: async () => {
      const res = await api.get("/api/watchlist/");
      return res.data;
    },
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: async ({ stock_code, note }: { stock_code: string; note?: string }) => {
      await api.post("/api/watchlist/", { stock_code: stock_code.trim().toUpperCase(), note: note || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      setAddCode("");
      setAddNote("");
      setShowAddForm(false);
    },
  });

  const handleAdd = () => {
    if (!addCode.trim()) return;
    addMutation.mutate({ stock_code: addCode, note: addNote });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Watchlist"
        title="追蹤清單"
        description={`即時評分追蹤你關注的標的${watchlist.length > 0 ? `・共 ${watchlist.length} 筆` : ""}`}
      >
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增追蹤
        </button>
      </PageHeader>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* 新增表單 */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">新增股票到追蹤清單</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              placeholder="股票代碼（例：2330）"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              type="text"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              placeholder="備注（選填）"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending || !addCode.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {addMutation.isPending ? "新增中..." : "新增"}
            </button>
          </div>
          {addMutation.isError && (
            <p className="text-red-500 text-xs mt-2">
              新增失敗：{(addMutation.error as any)?.response?.data?.detail ?? "請稍後重試"}
            </p>
          )}
        </div>
      )}

      {/* 清單 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-32" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">需要登入才能使用追蹤清單</p>
          <Link href="/login" className="text-blue-500 text-sm hover:underline mt-2 block">
            前往登入
          </Link>
        </div>
      ) : watchlist.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">追蹤清單為空</p>
          <p className="text-gray-300 text-xs mt-1">在個股頁面點擊「+ 追蹤」，或使用上方按鈕新增</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map((item) => (
            <WatchlistScoreRow key={item.id} item={item} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
