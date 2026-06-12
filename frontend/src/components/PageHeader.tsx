import type { ReactNode } from "react";

interface Props {
  eyebrow: string;        // 小型大寫標籤（如 WAR ROOM / SCREENER）
  title: string;          // 頁面主標
  description?: string;   // 一句話說明
  children?: ReactNode;   // 右側插槽：即時數據、搜尋框、操作按鈕
}

/**
 * 深色頁首帶 — 與全站 Header 連成一體的頁面開場。
 * 設計語言：slate-900 底、eyebrow 小型大寫、右側放真實數據或主要操作。
 */
export default function PageHeader({ eyebrow, title, description, children }: Props) {
  return (
    <section className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-indigo-400 mb-2">
              {eyebrow}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
            {description && (
              <p className="text-[13px] text-slate-400 mt-1.5 max-w-xl">{description}</p>
            )}
          </div>
          {children && <div className="flex-shrink-0">{children}</div>}
        </div>
      </div>
    </section>
  );
}
