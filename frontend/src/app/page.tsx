import Link from "next/link";
import { TrendingUp, BarChart3, Brain, Activity, ArrowRight, Search, Zap, Shield, Clock } from "lucide-react";

const features = [
  {
    title: "技術分析",
    desc: "MA、RSI、MACD、KDJ、布林帶等多指標分析，掌握趨勢與進出場時機",
    href: "/technical",
    icon: TrendingUp,
    gradient: "from-blue-500/10 to-transparent",
    border: "border-slate-800 hover:border-blue-500/50",
    iconCls: "bg-blue-500/10 text-blue-400",
    linkCls: "text-blue-400",
    tag: "技術面",
    tagCls: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    title: "籌碼分析",
    desc: "法人動向、融資融券、籌碼集中度，追蹤主力資金流向",
    href: "/chip",
    icon: BarChart3,
    gradient: "from-emerald-500/10 to-transparent",
    border: "border-slate-800 hover:border-emerald-500/50",
    iconCls: "bg-emerald-500/10 text-emerald-400",
    linkCls: "text-emerald-400",
    tag: "籌碼面",
    tagCls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  {
    title: "情緒分析",
    desc: "LLM 驅動的新聞與論壇情緒評分，感知市場情緒溫度",
    href: "/sentiment",
    icon: Brain,
    gradient: "from-purple-500/10 to-transparent",
    border: "border-slate-800 hover:border-purple-500/50",
    iconCls: "bg-purple-500/10 text-purple-400",
    linkCls: "text-purple-400",
    tag: "情緒面",
    tagCls: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    title: "決策中心",
    desc: "多因子評分、雷達圖、決策樹訊號，系統化輔助投資決策",
    href: "/decision",
    icon: Activity,
    gradient: "from-orange-500/10 to-transparent",
    border: "border-slate-800 hover:border-orange-500/50",
    iconCls: "bg-orange-500/10 text-orange-400",
    linkCls: "text-orange-400",
    tag: "決策",
    tagCls: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
];

const stats = [
  { label: "分析維度", value: "4 大" },
  { label: "技術指標", value: "15+" },
  { label: "資料來源", value: "TWSE / Yahoo" },
  { label: "AI 模型", value: "Ollama LLM" },
];

const highlights = [
  {
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-slate-800",
    title: "本地 AI 情緒分析",
    desc: "Ollama 本地部署 LLM，隱私安全，分析新聞與論壇情緒，生成結構化投資摘要",
  },
  {
    icon: Shield,
    color: "text-blue-400",
    bg: "bg-slate-800",
    title: "多因子評分系統",
    desc: "技術 30%、籌碼 30%、基本面 20%、情緒 20%，加權合成決策評分，搭配雷達圖視覺化",
  },
  {
    icon: Clock,
    color: "text-emerald-400",
    bg: "bg-slate-800",
    title: "盤前盤後全追蹤",
    desc: "整合 TWSE、Yahoo Finance 多資料源，自動排程更新，ADR、國際指數即時掌握",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-blue-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            <Zap className="w-3.5 h-3.5" />
            AI 驅動 · 多維度分析 · 系統化決策
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-5 leading-tight tracking-tight">
            精準洞察
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {" "}智慧決策
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            整合技術面、籌碼面、情緒面、產業鏈四大維度，提供台股系統化投資分析與決策支援
          </p>

          <form action="/technical" method="get" className="flex gap-2 max-w-md mx-auto mb-14">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                name="code"
                placeholder="輸入股票代碼 (如 2330)"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-medium transition-colors text-sm whitespace-nowrap"
            >
              開始分析
            </button>
          </form>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="text-lg font-bold text-white">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">四大分析模組</h2>
          <p className="text-slate-500 text-sm">全方位掌握個股動態，輔助系統化投資決策</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Link
                key={f.href}
                href={f.href}
                className={`group relative flex flex-col p-6 bg-slate-900 rounded-2xl border ${f.border} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 overflow-hidden`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}
                />
                <div className="relative flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${f.iconCls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${f.tagCls}`}>{f.tag}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-4">{f.desc}</p>
                </div>
                <div className={`relative flex items-center ${f.linkCls} text-sm font-medium gap-1`}>
                  開始分析
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Highlights */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {highlights.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.title} className="flex items-start gap-4">
                  <div className={`w-10 h-10 ${h.bg} rounded-xl flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${h.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-1">{h.title}</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">{h.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
