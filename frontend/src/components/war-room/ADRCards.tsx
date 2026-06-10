import { TrendingUp, TrendingDown } from "lucide-react";

export interface ADRData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
}

interface Props {
  adrList: ADRData[];
  loading?: boolean;
}

export default function ADRCard({ adrList, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">ADR 表現</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
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
      <h3 className="text-base font-semibold text-gray-900 mb-4">ADR 表現</h3>
      <div className="space-y-3">
        {adrList.map((adr) => (
          <div key={adr.ticker} className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm font-medium text-gray-900">{adr.ticker}</span>
              <span className="text-xs text-gray-500 ml-2">{adr.name}</span>
            </div>
            <div
              className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
                adr.change_percent >= 0
                  ? "text-green-700 bg-green-50"
                  : "text-red-700 bg-red-50"
              }`}
            >
              {adr.change_percent >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {adr.change_percent >= 0 ? "+" : ""}
              {adr.change_percent.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
