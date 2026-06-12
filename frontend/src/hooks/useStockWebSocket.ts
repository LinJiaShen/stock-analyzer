/**
 * 個股即時 WebSocket Hook
 * 連線到後端 WebSocket 端點，接收即時 K 線數據
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface CandleUpdate {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  minute_bar: boolean;
  completed: boolean;
}

export interface WebSocketMessage {
  type: "connected" | "candle_update" | "pong" | "subscribed" | "error";
  stock_code?: string;
  /** For candle_update: "daily" | "1m" | "5m". For connected: the requested interval. */
  interval?: string;
  market_open?: boolean;
  message?: string;
  data?: CandleUpdate;
  timestamp?: string;
}

interface UseStockWebSocketOptions {
  stockCode: string;
  interval?: "all" | "1m" | "5m" | "daily";
  enabled?: boolean;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

export function useStockWebSocket({
  stockCode,
  interval = "all",
  enabled = true,
  onMessage,
  onConnect,
  onError,
}: UseStockWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    if (!stockCode || !enabled) return;

    // 關閉舊連線
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // 清除計時器
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    try {
      // 根據環境決定 WebSocket 地址
      const isDev = typeof window !== "undefined" && window.location.hostname === "localhost";
      const wsUrl = isDev
        ? `ws://localhost:8000/ws/stock/${stockCode}?interval=${interval}`
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/stock/${stockCode}?interval=${interval}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] 已連線 ${stockCode}`);
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        onConnect?.(true);

        // 啟動心跳
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 30000); // 每 30 秒心跳
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);

          // 處理連線消息
          if (message.type === "connected") {
            setMarketOpen(message.market_open || false);
          }

          // 處理 pong
          if (message.type === "pong") {
            // 心跳回應，不需要處理
          }

          onMessage?.(message);
        } catch (e) {
          console.error("[WebSocket] 消息解析錯誤:", e);
        }
      };

      ws.onerror = (error) => {
        console.warn(`[WebSocket] 連線失敗 ${stockCode} (盤中才有即時資料)`);
        onError?.(new Error("WebSocket 連線錯誤"));
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] 斷線 ${stockCode}, code: ${event.code}`);
        setConnected(false);
        onConnect?.(false);

        // 清除心跳
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }

        // 嘗試重新連線
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[WebSocket] ${delay}ms 後嘗試重新連線 (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error("[WebSocket] 重新連線次數已達上限");
          onError?.(new Error("重新連線次數已達上限"));
        }
      };
    } catch (e) {
      console.error("[WebSocket] 建立連線失敗:", e);
      onError?.(e as Error);
    }
  }, [stockCode, interval, enabled, onMessage, onConnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  const subscribe = useCallback((newCode: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(`subscribe:${newCode}`);
    }
  }, []);

  useEffect(() => {
    if (enabled && stockCode) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [stockCode, interval, enabled, connect, disconnect]);

  return {
    connected,
    marketOpen,
    lastMessage,
    connect,
    disconnect,
    subscribe,
  };
}
