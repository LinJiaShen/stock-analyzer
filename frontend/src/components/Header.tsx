"use client";

import { useState, useEffect } from "react";
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
  LayoutDashboard,
  LogIn,
  LogOut,
  User,
} from "lucide-react";

export default function Header() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUsername = localStorage.getItem("username");
    if (token) {
      setIsLoggedIn(true);
      setUsername(storedUsername || "");
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
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
    { name: "個股分析", href: "/stock/2330", icon: TrendingUp },
    { name: "技術分析", href: "/technical", icon: TrendingUp },
    { name: "籌碼分析", href: "/chip", icon: BarChart3 },
    { name: "情緒分析", href: "/sentiment", icon: Brain },
    { name: "決策中心", href: "/decision", icon: Activity },
    ...(isLoggedIn ? [{
      name: "持倉",
      href: null as string | null,
      icon: LayoutDashboard,
      children: [
        { name: "持倉管理", href: "/holdings", icon: BarChart3 },
        { name: "持倉分析", href: "/holdings/analysis", icon: Activity },
      ],
    }] : []),
  ];

  const isActive = (href: string | null) => {
    if (!href) {
      return pathname?.startsWith("/pre-market") || pathname?.startsWith("/intraday") || pathname?.startsWith("/after-market") || pathname?.startsWith("/holdings");
    }
    // 個股分析入口：當路徑以 /stock/ 開頭時高亮
    if (href === "/stock/2330") {
      return pathname?.startsWith("/stock/");
    }
    return pathname === href;
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">StockVision</span>
          </Link>

          {/* Navigation */}
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
                          ? "text-blue-600 bg-blue-50"
                          : "text-gray-600 hover:text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{item.name}</span>
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </button>
                    {/* Dropdown */}
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg border border-gray-200 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
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
                                  ? "text-blue-600 bg-blue-50 font-medium"
                                  : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
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
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-600 hover:text-blue-600 hover:bg-blue-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Auth buttons */}
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {username}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">登出</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">登入</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
