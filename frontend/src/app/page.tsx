import Link from "next/link";
import {
  TrendingUp,
  BarChart3,
  Brain,
  Activity,
  ArrowRight,
  Filter,
  Search,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import HeroChart from "@/components/HeroChart";

const FEATURES = [
  {
    href: "/technical",
    title: "技術分析",
    desc: "K 線、均線、RSI、MACD 多指標，互動式圖表縮放與形態偵測",
    icon: TrendingUp,
  },
  {
    href: "/chip",
    title: "籌碼分析",
    desc: "三大法人買賣超、外資連買天數、籌碼集中度追蹤",
    icon: BarChart3,
  },
  {
    href: "/sentiment",
    title: "情緒分析",
    desc: "多家媒體新聞聚合，本地 LLM 逐則評分利多利空",
    icon: Brain,
  },
  {
    href: "/decision",
    title: "決策中心",
    desc: "多因子綜合評分，AI 解讀為什麼、該注意什麼",
    icon: Activity,
  },
];

const STEPS = [
  {
    step: "01",
    title: "找標的",
    desc: "用篩選器依波動度、突破訊號、外資動向掃描全市場候選股",
    href: "/screener",
    icon: Filter,
    cta: "開始篩選",
  },
  {
    step: "02",
    title: "看懂它",
    desc: "進個股頁看綜合評分、AI 分析與操作建議，白話判讀不需背景知識",
    href: "/stock/2330",
    icon: Sparkles,
    cta: "以台積電為例",
  },
  {
    step: "03",
    title: "先模擬",
    desc: "用模擬交易測試進出場計畫，追蹤勝率與盈虧比，再投入真金",
    href: "/paper",
    icon: FlaskConical,
    cta: "建立模擬單",
  },
];

const STATS = [
  { value: "2,373", label: "上市櫃個股與 ETF" },
  { value: "4 + 1", label: "評分維度 + K線形態" },
  { value: "10+", label: "新聞媒體來源" },
  { value: "18:05", label: "每交易日自動更新" },
];

export default function Home() {
  return (
    <div>
      {/* Hero — 與深色 Header 連成一體，右側為真實資料署名圖 */}
      <section className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-up">
              <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-indigo-400 mb-4">
                台股多因子分析平台
              </div>
              <h1 className="text-4xl sm:text-[44px] font-bold text-white mb-5 tracking-tight leading-[1.15]">
                看懂一檔股票，
                <br />
                不必是專家。
              </h1>
              <p className="text-[15px] text-slate-400 leading-relaxed max-w-md mb-8">
                技術、籌碼、情緒、基本面四維評分，AI 用白話告訴你為什麼；
                再用模擬單驗證想法，不花一毛真錢。
              </p>

              {/* 快速查詢 */}
              <form action="/technical" method="get" className="max-w-sm">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    name="code"
                    placeholder="輸入股票代碼（例：2330）"
                    className="w-full pl-11 pr-22 pr-24 py-3 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    分析
                  </button>
                </div>
              </form>
            </div>

            {/* 署名圖：真實年線自繪 */}
            <div className="hidden lg:block">
              <HeroChart />
            </div>
          </div>
        </div>

        {/* 數據帶（嵌在深色區底部） */}
        <div className="border-t border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800">
              {STATS.map((s) => (
                <div key={s.label} className="py-4 px-4 first:pl-0">
                  <div className="text-xl font-bold font-mono text-white">{s.value}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

      {/* 新手三步驟 */}
      <div className="mb-14">
        <div className="eyebrow mb-5">工作流程</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.step}
                href={s.href}
                className="group bg-white p-7 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-5">
                  <Icon className="w-5 h-5 text-indigo-600" strokeWidth={1.75} />
                  <span className="text-xs font-mono text-slate-300">{s.step}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed mb-4">{s.desc}</p>
                <span className="inline-flex items-center text-[13px] font-medium text-indigo-600">
                  {s.cta}
                  <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 四大分析引擎 */}
      <div className="mb-14">
        <div className="eyebrow mb-5">分析引擎</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Link
                key={f.href}
                href={f.href}
                className="group block p-6 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50 transition-all"
              >
                <div className="w-9 h-9 bg-slate-100 group-hover:bg-indigo-50 rounded-lg flex items-center justify-center mb-4 transition-colors">
                  <Icon className="w-4.5 h-4.5 w-5 h-5 text-slate-600 group-hover:text-indigo-600 transition-colors" strokeWidth={1.75} />
                </div>
                <h3 className="text-[15px] font-bold text-slate-900 mb-1.5">{f.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{f.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 戰情室導引 */}
      <div className="bg-slate-900 rounded-xl px-8 py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <h2 className="text-base font-bold text-white mb-1">每天 10 分鐘的看盤儀式</h2>
          <p className="text-[13px] text-slate-400">
            盤前看隔夜美股與 ADR，盤中追蹤即時報價，盤後覆盤法人動向與全市場排行
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link href="/pre-market" className="px-4 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-[13px] font-medium rounded-lg transition-colors">
            盤前
          </Link>
          <Link href="/intraday" className="px-4 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-[13px] font-medium rounded-lg transition-colors">
            盤中
          </Link>
          <Link href="/after-market" className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 text-[13px] font-bold rounded-lg transition-colors">
            盤後覆盤
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
