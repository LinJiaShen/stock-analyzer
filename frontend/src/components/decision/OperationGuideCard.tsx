import { Target, ShieldAlert, TrendingUp } from "lucide-react";

export interface OperationGuide {
  entry_note: string;
  stop_loss: number;
  stop_loss_pct: number;
  target: number;
  target_pct: number;
  rr_ratio: number;
  hold_period: string;
}

interface Props {
  data: OperationGuide | null | undefined;
  loading?: boolean;
}

export default function OperationGuideCard({ data, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">操作建議</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">操作建議</h3>
        <p className="text-sm text-gray-400">目前訊號不足或資料不完整，無法產生操作建議</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">操作建議</h3>
        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">{data.hold_period}</span>
      </div>

      <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg mb-4">{data.entry_note}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* 停損 */}
        <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-medium text-red-600">停損</span>
          </div>
          <div className="text-lg font-bold font-mono text-red-700">{data.stop_loss}</div>
          <div className="text-xs text-red-500">{data.stop_loss_pct}%</div>
        </div>

        {/* 進場 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-medium text-blue-600">進場</span>
          </div>
          <div className="text-lg font-bold font-mono text-blue-700">參考</div>
          <div className="text-xs text-blue-500">依訊號操作</div>
        </div>

        {/* 目標 */}
        <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-medium text-green-600">目標</span>
          </div>
          <div className="text-lg font-bold font-mono text-green-700">{data.target}</div>
          <div className="text-xs text-green-500">+{data.target_pct}%</div>
        </div>
      </div>

      {/* 風報比 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">風險報酬比</span>
        <span
          className={`font-bold ${
            data.rr_ratio >= 2 ? "text-green-600" : data.rr_ratio >= 1 ? "text-yellow-600" : "text-red-600"
          }`}
        >
          1 : {data.rr_ratio}
        </span>
      </div>
    </div>
  );
}
