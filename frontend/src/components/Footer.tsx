import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 bg-slate-900 rounded flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">SV</span>
              </div>
              <span className="text-sm font-bold text-gray-900">StockVision</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              台股多因子分析平台。技術、籌碼、情緒、基本面四維評分，
              以本地 LLM 生成白話解讀，輔助投資研究。
            </p>
          </div>
          <div>
            <div className="eyebrow mb-3">資料來源</div>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li>行情・籌碼：臺灣證券交易所（TWSE）、證券櫃檯買賣中心（TPEx）OpenAPI</li>
              <li>歷史K線・美股：Yahoo Finance／永豐金證券 Shioaji</li>
              <li>新聞：鉅亨網、Google News（經濟日報、工商時報等多家媒體）</li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">更新時間</div>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li>全市場日K・大盤指數 — 每交易日 18:05</li>
              <li>三大法人買賣超 — 每交易日 18:30</li>
              <li>新聞情緒 — 每小時</li>
            </ul>
          </div>
        </div>
        <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-2xl">
            本平台所有評分、訊號與 AI 生成內容均為量化模型產出，僅供投資研究參考，
            不構成任何投資建議或要約。投資人應自行判斷並承擔投資風險。
          </p>
          <div className="flex items-center gap-4 text-[11px] text-gray-400 flex-shrink-0">
            <Link href="/screener" className="hover:text-gray-600 transition-colors">篩選器</Link>
            <Link href="/decision" className="hover:text-gray-600 transition-colors">決策中心</Link>
            <Link href="/paper" className="hover:text-gray-600 transition-colors">模擬交易</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
