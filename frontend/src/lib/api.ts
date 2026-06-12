import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // 認證 token 存在 HttpOnly Cookie，瀏覽器自動帶上（防 XSS）
  withCredentials: true,
  timeout: 30000,
});

// 回應攔截器 - 處理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 清除前端登入狀態標記（token 本體在 HttpOnly Cookie，由後端管理）
      if (typeof window !== "undefined") {
        localStorage.removeItem("username");
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
