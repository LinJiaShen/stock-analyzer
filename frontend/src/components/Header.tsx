"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LineChart,
  TrendingUp,
  BarChart3,
  Brain,
  Activity,
  ChevronDown,
  Sun,
  Monitor,
  Moon,
} from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "戰情室",
      href: null as string | null,
      icon: LineChart,
      children: [
        { name: "盤前戰情室", href: "/pre-market", icon: Sun },
        { name: "盤中追蹤", href: "/intraday", icon: Monitor },
        { name: "盤後覆盤", href: "/after-market", icon: Moon },
      ],
    },
    { name: "技術分析", href: "/technical", icon: TrendingUp },
    { name: "籌碼分析", href: "/chip", icon: BarChart3 },
    { name: "情緒分析", href: "/sentiment", icon: Brain },
    { name: "決策中心", href: "/decision", icon: Activity },
  ];

  const isActive = (href: string | null) => {
    if (!href) {
      return (
        pathname?.startsWith("/pre-market") ||
        pathname?.startsWith("/intraday") ||
        pathname?.startsWith("/after-market")
      );
    }
    return pathname === href;
  };

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">StockVision</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              if (item.children) {
                return (
                  <div key={item.name} className="group relative">
                    <button
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{item.name}</span>
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </button>
                    <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 rounded-lg border border-slate-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      <div className="py-1">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                                childActive
                                  ? "text-blue-400 bg-blue-500/10 font-medium"
                                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
                              }`}
                            >
                              <ChildIcon className="w-4 h-4" />
                              {child.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href || item.name}
                  href={item.href!}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
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
