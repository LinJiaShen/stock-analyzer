import { useState, useEffect } from "react";

/** 台灣股市交易時間: 週一至週五 09:00–12:50、13:00–13:30 (UTC+8) */
function checkMarketOpen(): boolean {
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day = taipei.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const minutes = taipei.getHours() * 60 + taipei.getMinutes();
  return (minutes >= 540 && minutes <= 770) || (minutes >= 780 && minutes <= 810);
}

/** 回傳台灣股市目前是否在交易時間，每分鐘重新檢查一次 */
export function useIsMarketOpen(): boolean {
  const [isOpen, setIsOpen] = useState(checkMarketOpen);

  useEffect(() => {
    const timer = setInterval(() => setIsOpen(checkMarketOpen()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return isOpen;
}
