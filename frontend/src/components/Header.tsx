"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
  LayoutDashboard,
  LogIn,
  LogOut,
  User,
  Star,
  Filter,
  FlaskConical,
  Search,
} from "lucide-react";
import { useIsMarketOpen } from "@/hooks/useIsMarketOpen";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  const stockInputRef = useRef<HTMLInputElement>(null);
  const isMarketOpen = useIsMarketOpen();

  // 加權指數即時行情（盤中每分鐘刷新，盤後 10 分鐘）
  const { data: summary } = useQuery<any>({
    queryKey: ["market-summary"],
    queryFn: async () => {
      const { api } = await import("@/lib/api");
      return (await api.get("/api/stocks/market-summary", { timeout: 60000 })).data;
    },
    staleTime: isMarketOpen ? 55 * 1000 : 5 * 60 * 1000,
    refetchInterval: isMarketOpen ? 60 * 1000 : 10 * 60 * 1000,
    retry: false,
  });
  const taiex = summary?.taiex;

  useEffect(() => {
    // Token 在 HttpOnly Cookie 中（JS 讀不到），用 username 標記判斷登入狀態
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setIsLoggedIn(true);
      setUsername(storedUsername);
    }
  }, []);

  // 點擊其他地方時關閉下拉選單
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenu]);

  // 切換頁面時關閉下拉選單
  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const { api } = await import("@/lib/api");
      await api.post("/api/auth/logout"); // 後端清除 HttpOnly Cookie
    } catch {
      // 即使後端失敗也清除前端狀態
    }
    localStorage.removeItem("username");
    setIsLoggedIn(false);
    setUsername("");
    window.location.href = "/login";
  };

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
    { name: "個股分析", href: null as string | null, icon: TrendingUp, isStockSearch: true, children: [] as any[] },
    { name: "技術分析", href: "/technical", icon: TrendingUp },
    { name: "籌碼分析", href: "/chip", icon: BarChart3 },
    { name: "情緒分析", href: "/sentiment", icon: Brain },
    { name: "決策中心", href: "/decision", icon: Activity },
    { name: "篩選器", href: "/screener", icon: Filter },
    ...(isLoggedIn ? [{
      name: "持倉",
      href: null as string | null,
      icon: LayoutDashboard,
      children: [
        { name: "持倉管理", href: "/holdings", icon: BarChart3 },
        { name: "持倉分析", href: "/holdings/analysis", icon: Activity },
        { name: "追蹤清單", href: "/watchlist", icon: Star },
        { name: "模擬交易", href: "/paper", icon: FlaskConical },
      ],
    }] : []),
  ];

  const isActive = (href: string | null, name?: string) => {
    if (!href) {
      if (name === "個股分析") return pathname?.startsWith("/stock/") ?? false;
      return (pathname?.startsWith("/pre-market") || pathname?.startsWith("/intraday") || pathname?.startsWith("/after-market") || pathname?.startsWith("/holdings")) ?? false;
    }
    return pathname === href;
  };

  const taiexUp = (taiex?.change_percent ?? 0) >= 0;

  return (
    <header className="bg-slate-900 sticky top-0 z-50 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold text-white tracking-tight">
              StockVision
            </span>
          </Link>

          {/* Navigation */}
          {/* 注意：不可加 overflow-x-auto，會裁切絕對定位的下拉選單 */}
          <nav className="hidden md:flex items-center h-full">
            {navItems.map((item) => {
              const active = isActive(item.href, item.name);

              if (item.children) {
                const isOpen = openMenu === item.name;
                const isStockSearch = (item as any).isStockSearch;
                return (
                  <div key={item.name} className="group relative h-full flex items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(isOpen ? null : item.name);
                        if (!isOpen && isStockSearch) {
                          setTimeout(() => stockInputRef.current?.focus(), 50);
                        }
                      }}
                      className={`flex items-center gap-1 px-3 h-full text-[13px] font-medium transition-colors border-b-2 ${
                        active || isOpen
                          ? "text-white border-indigo-500"
                          : "text-slate-400 border-transparent hover:text-white"
                      }`}
                    >
                      {item.name}
                      <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {/* Dropdown */}
                    <div className={`absolute top-full left-0 mt-0 bg-slate-800 rounded-b-lg border border-slate-700 border-t-0 shadow-xl shadow-black/30 transition-all z-50 overflow-hidden ${
                      isStockSearch ? "w-56" : "w-44"
                    } ${
                      isOpen ? "opacity-100 visible" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                    }`}>
                      {isStockSearch ? (
                        <div className="p-3">
                          <p className="text-[11px] text-slate-500 mb-2">輸入股票代碼查詢</p>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const code = stockSearch.trim();
                              if (code) {
                                router.push(`/stock/${code}`);
                                setOpenMenu(null);
                                setStockSearch("");
                              }
                            }}
                            className="flex gap-2"
                          >
                            <input
                              ref={stockInputRef}
                              type="text"
                              value={stockSearch}
                              onChange={(e) => setStockSearch(e.target.value)}
                              placeholder="如：2330、2454"
                              className="flex-1 bg-slate-700 border border-slate-600 text-white text-[13px] rounded px-2.5 py-1.5 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors flex-shrink-0"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </form>
                          <div className="mt-2.5 pt-2.5 border-t border-slate-700">
                            <p className="text-[11px] text-slate-500 mb-1.5">常用</p>
                            <div className="flex flex-wrap gap-1.5">
                              {["2330", "2317", "2454", "2412", "2882"].map((code) => (
                                <button
                                  key={code}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/stock/${code}`);
                                    setOpenMenu(null);
                                  }}
                                  className="text-[11px] px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors"
                                >
                                  {code}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-1">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            const childActive = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${
                                  childActive
                                    ? "text-white bg-slate-700/60 font-medium"
                                    : "text-slate-300 hover:bg-slate-700/40 hover:text-white"
                                }`}
                              >
                                <ChildIcon className="w-3.5 h-3.5 opacity-60" />
                                {child.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href || item.name}
                  href={item.href!}
                  className={`flex items-center px-3 h-full text-[13px] font-medium transition-colors border-b-2 ${
                    active
                      ? "text-white border-indigo-500"
                      : "text-slate-400 border-transparent hover:text-white"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* 右側：加權指數 + 市場狀態 + 帳號 */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* 加權指數即時行情 */}
            {taiex && (
              <Link href="/after-market" className="hidden lg:flex items-center gap-2 group">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 leading-none mb-0.5 group-hover:text-slate-400">
                    加權指數
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-mono font-bold text-white leading-none">
                      {taiex.price?.toLocaleString()}
                    </span>
                    <span className={`text-[11px] font-mono font-medium leading-none ${
                      taiexUp ? "text-red-400" : "text-green-400"
                    }`}>
                      {taiexUp ? "+" : ""}{taiex.change_percent}%
                    </span>
                  </div>
                </div>
              </Link>
            )}

            {/* 市場狀態 */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isMarketOpen ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`} />
              <span className="text-[11px] font-medium text-slate-400">
                {isMarketOpen ? "盤中" : "已收盤"}
              </span>
            </div>

            {/* 帳號 */}
            {isLoggedIn ? (
              <div className="flex items-center gap-1">
                <span className="text-[13px] text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  {username}
                </span>
                <button
                  onClick={handleLogout}
                  title="登出"
                  className="p-2 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                登入
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
