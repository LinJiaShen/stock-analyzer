"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChart, TrendingUp, BarChart3, Brain, Activity } from "lucide-react";

const navItems = [
  { name: "戰情室", href: "/", icon: LineChart },
  { name: "技術分析", href: "/technical", icon: TrendingUp },
  { name: "籌碼分析", href: "/chip", icon: BarChart3 },
  { name: "情緒分析", href: "/sentiment", icon: Brain },
  { name: "決策中心", href: "/decision", icon: Activity },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center group-hover:bg-blue-400 transition-colors">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">StockVision</span>
          </Link>

          <nav className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
