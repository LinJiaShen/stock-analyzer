import Link from "next/link";
import { TrendingUp, BarChart3, Brain, Activity, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          StockVision 股票分析決策平台
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          深度分析引擎：技術分析、籌碼分析、情緒分析、產業鏈分析，輔助投資決策
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <Link
          href="/technical"
          className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">技術分析</h3>
          <p className="text-sm text-gray-600">
            MA、RSI、MACD、KDJ、布林帶等多指標分析
          </p>
          <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
            開始分析 <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link
          href="/chip"
          className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-green-300 transition-all"
        >
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <BarChart3 className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">籌碼分析</h3>
          <p className="text-sm text-gray-600">
            法人動向、融資融券、籌碼集中度追蹤
          </p>
          <div className="mt-4 flex items-center text-green-600 text-sm font-medium">
            開始分析 <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link
          href="/sentiment"
          className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <Brain className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">情緒分析</h3>
          <p className="text-sm text-gray-600">
            LLM 驅動的新聞與論壇情緒評分
          </p>
          <div className="mt-4 flex items-center text-purple-600 text-sm font-medium">
            開始分析 <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link
          href="/decision"
          className="block p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all"
        >
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-orange-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">決策中心</h3>
          <p className="text-sm text-gray-600">
            多因子評分、雷達圖、決策樹訊號
          </p>
          <div className="mt-4 flex items-center text-orange-600 text-sm font-medium">
            開始分析 <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>
      </div>

      {/* Quick Search */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">快速查詢</h2>
        <form action="/technical" method="get" className="flex gap-3">
          <input
            type="text"
            name="code"
            placeholder="輸入股票代碼 (例: 2330, 2317)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            分析
          </button>
        </form>
      </div>
    </div>
  );
}
