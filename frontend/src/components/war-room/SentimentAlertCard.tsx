import { AlertTriangle, Info, CheckCircle } from "lucide-react";

export interface SentimentAlert {
  id: string;
  level: "warning" | "info" | "success";
  title: string;
  description: string;
  affected_stocks?: string[];
  timestamp?: string;
}

interface Props {
  alerts: SentimentAlert[];
  loading?: boolean;
}

const levelConfig = {
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    label: "警告",
  },
  info: {
    icon: Info,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    label: "資訊",
  },
  success: {
    icon: CheckCircle,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    label: "正面",
  },
};

export default function SentimentAlertCard({ alerts, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">情緒預警</h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse p-3 bg-gray-50 rounded-lg">
              <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">情緒預警</h3>
      <div className="space-y-3">
        {alerts.map((alert) => {
          const config = levelConfig[alert.level];
          const Icon = config.icon;
          return (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${config.bg} ${config.border}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{alert.title}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{alert.description}</p>
                  {alert.affected_stocks && alert.affected_stocks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {alert.affected_stocks.map((code) => (
                        <span
                          key={code}
                          className="text-xs font-mono px-1.5 py-0.5 bg-white/60 rounded text-gray-700"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">目前無情緒預警</div>
        )}
      </div>
    </div>
  );
}
