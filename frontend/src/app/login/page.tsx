"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import HeroChart from "@/components/HeroChart";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Cookie（HttpOnly）為主要認證方式；同時把 token 存 localStorage 作為跨裝置 Bearer fallback
      const res = await api.post("/api/auth/login", { username, password });
      if (res.data?.access_token) {
        localStorage.setItem("access_token", res.data.access_token);
      }
      localStorage.setItem("username", username);
      router.push("/");
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError("嘗試次數過多，請稍後再試");
      } else {
        setError(err.response?.data?.detail || "登入失敗，請檢查帳號密碼");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid grid-cols-1 lg:grid-cols-2">
      {/* 左欄：深色品牌面（真實年線署名圖） */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 border-r border-slate-800 p-12">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold text-white tracking-tight">StockVision</span>
          </div>
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-indigo-400 mb-3">
            台股多因子分析平台
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight leading-snug mb-4">
            登入後解鎖
            <br />
            持倉健診與模擬交易。
          </h1>
          <ul className="text-[13px] text-slate-400 space-y-2">
            <li>・追蹤清單即時評分</li>
            <li>・持倉損益與健康診斷</li>
            <li>・模擬單勝率與盈虧比統計</li>
          </ul>
        </div>
        <div>
          <HeroChart />
        </div>
      </div>

      {/* 右欄：登入表單 */}
      <div className="flex items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-1.5">登入</h2>
          <p className="text-[13px] text-slate-500 mb-7">使用你的帳號繼續</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                帳號
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="請輸入帳號"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                密碼
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  placeholder="請輸入密碼"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  登入中...
                </>
              ) : (
                "登入"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            還沒有帳號？{" "}
            <Link href="/register" className="text-indigo-600 hover:text-indigo-500 font-medium">
              立即註冊
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
