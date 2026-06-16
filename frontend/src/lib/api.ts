import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // 認證 token 優先用 HttpOnly Cookie，跨裝置 fallback 用 Bearer token
  withCredentials: true,
  timeout: 30000,
});

// 請求攔截器 - Cookie 不可用時注入 Bearer token（跨裝置 / 隱私瀏覽 fallback）
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && !config.headers["Authorization"]) {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return config;
});

// 回應攔截器 - 處理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("username");
        localStorage.removeItem("access_token");
        // 只有在「需要登入的頁面」才跳轉，背景查詢失敗不打斷使用者
        const protectedPaths = ["/holdings", "/watchlist"];
        const path = window.location.pathname;
        if (protectedPaths.some((p) => path.startsWith(p)) && path !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
