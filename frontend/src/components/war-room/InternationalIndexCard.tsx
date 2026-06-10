import { TrendingUp, TrendingDown } from "lucide-react";

export interface IndexData {
  name: string;
  value: number;
  change: number;
  change_percent: number;
}

interface Props {
  indices: IndexData[];
  loading?: boolean;
}

export default function InternationalIndexCard({ indices, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">隔夜國際股市</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse flex justify-between">
              <div className="h-4 bg-gray-200 rounded w-20" />
              <div className="h-4 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">隔夜國際股市</h3>
      <div className="space-y-3">
        {indices.map((idx) => (
          <div key={idx.name} className="flex items-center justify-between py-1">
            <span className="text-sm text-gray-700 font-medium">{idx.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900 font-mono">
                {idx.value.toLocaleString()}
              </span>
              <div
                className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                  idx.change_percent >= 0
                    ? "text-green-700 bg-green-50"
                    : "text-red-700 bg-red-50"
                }`}
              >
                {idx.change_percent >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {idx.change_percent >= 0 ? "+" : ""}
                {idx.change_percent.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
