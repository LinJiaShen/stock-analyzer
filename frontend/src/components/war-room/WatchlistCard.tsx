import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import Link from "next/link";

export interface WatchlistStock {
  code: string;
  name: string;
  gap_probability?: number;
  resistance?: number;
  support?: number;
  price?: number;
  change?: number;
  change_percent?: number;
  status?: string;
  signal?: string;
}

interface Props {
  stocks: WatchlistStock[];
  loading?: boolean;
  mode?: "pre-market" | "intraday" | "after-market";
}

export default function WatchlistCard({ stocks, loading = false, mode = "pre-market" }: Props) {
  const title =
    mode === "pre-market"
      ? "當日關注清單"
      : mode === "intraday"
      ? "關注個股即時動態"
      : "明日推薦潛力股";

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse p-3 bg-gray-50 rounded-lg">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {stocks.map((stock) => (
          <Link
            key={stock.code}
            href={`/technical?code=${stock.code}`}
            className="block p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-bold text-gray-900">{stock.code}</span>
                <span className="text-sm text-gray-600 ml-2">{stock.name}</span>
              </div>
              {stock.signal && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    stock.signal === "買入"
                      ? "text-green-700 bg-green-100"
                      : stock.signal === "賣出"
                      ? "text-red-700 bg-red-100"
                      : "text-yellow-700 bg-yellow-100"
                  }`}
                >
                  {stock.signal}
                </span>
              )}
            </div>

            {mode === "pre-market" && (
              <div className="space-y-1">
                {stock.gap_probability !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">跳空機率</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            stock.gap_probability >= 60
                              ? "bg-green-500"
                              : stock.gap_probability >= 40
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${stock.gap_probability}%` }}
                        />
                      </div>
                      <span className="font-medium text-gray-700">
                        {stock.gap_probability}%
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    壓力位: <span className="text-red-600 font-medium">{stock.resistance}</span>
                  </span>
                  <span className="text-gray-500">
                    支撐位: <span className="text-green-600 font-medium">{stock.support}</span>
                  </span>
                </div>
              </div>
            )}

            {mode === "intraday" && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span>
                    價格:{" "}
                    <span className="font-mono font-medium text-gray-900">
                      {stock.price?.toLocaleString()}
                    </span>
                  </span>
                  <span
                    className={`font-medium ${
                      stock.change_percent && stock.change_percent >= 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {stock.change_percent && stock.change_percent >= 0 ? "+" : ""}
                    {stock.change_percent?.toFixed(2)}%
                  </span>
                </div>
                {stock.status && (
                  <div className="flex items-center gap-1">
                    {stock.status === "突破中" ? (
                      <TrendingUp className="w-3 h-3 text-green-600" />
                    ) : stock.status === "警示" ? (
                      <AlertTriangle className="w-3 h-3 text-yellow-600" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-gray-600">{stock.status}</span>
                  </div>
                )}
              </div>
            )}

            {mode === "after-market" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">綜合評分</span>
                  <span className="font-bold text-blue-600">
                    {stock.signal?.includes("評分") ? stock.signal : "N/A"}
                  </span>
                </div>
                {stock.signal && (
                  <p className="text-xs text-gray-600 leading-relaxed">{stock.signal}</p>
                )}
              </div>
            )}
          </Link>
        ))}

        {stocks.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">暫無關注個股</div>
        )}
      </div>
    </div>
  );
}
