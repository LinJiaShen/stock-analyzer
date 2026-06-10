import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type {
  Stock,
  KLinePoint,
  ChipDataPoint,
  PreMarketData,
  TechnicalAnalysis,
  ChipAnalysis,
  SentimentAnalysis,
  IndustryAnalysis,
  ScoreData,
  RadarData,
  Signal,
} from "@/types";

// 股票 API
export function useStocks() {
  return useQuery<Stock[]>({
    queryKey: ["stocks"],
    queryFn: async () => {
      const { data } = await api.get("/api/stocks/");
      return data;
    },
  });
}

export function useStock(code: string) {
  return useQuery<Stock>({
    queryKey: ["stock", code],
    queryFn: async () => {
      const { data } = await api.get(`/api/stocks/${code}`);
      return data;
    },
    enabled: !!code,
  });
}

export function useKLine(
  code: string,
  startDate: string,
  endDate: string,
  interval: string = "1d",
  adjusted: boolean = true
) {
  return useQuery<KLinePoint[]>({
    queryKey: ["kline", code, startDate, endDate, interval, adjusted],
    queryFn: async () => {
      const { data } = await api.get(`/api/stocks/${code}/kline`, {
        params: { interval, start_date: startDate, end_date: endDate, adjusted },
      });
      return data;
    },
    enabled: !!code && !!startDate && !!endDate,
  });
}

export function useChipData(code: string, days: number = 90) {
  return useQuery<ChipDataPoint[]>({
    queryKey: ["chip", code, days],
    queryFn: async () => {
      const { data } = await api.get(`/api/stocks/${code}/chip`, {
        params: { days },
      });
      return data;
    },
    enabled: !!code,
  });
}

export function usePreMarket() {
  return useQuery<PreMarketData>({
    queryKey: ["premarket"],
    queryFn: async () => {
      const { data } = await api.get("/api/stocks/pre-market");
      return data;
    },
  });
}

// 分析 API
export function useTechnicalAnalysis(
  code: string,
  period: string = "medium",
  interval: string = "1d"
) {
  return useQuery<TechnicalAnalysis>({
    queryKey: ["technical", code, period, interval],
    queryFn: async () => {
      const { data } = await api.get(`/api/analysis/technical/${code}`, {
        params: { period, interval },
      });
      return data;
    },
    enabled: !!code,
  });
}

export function useChipAnalysis(code: string, days: number = 90) {
  return useQuery<ChipAnalysis>({
    queryKey: ["chip-analysis", code, days],
    queryFn: async () => {
      const { data } = await api.get(`/api/analysis/chip/${code}`, {
        params: { days },
      });
      return data;
    },
    enabled: !!code,
  });
}

export function useSentimentAnalysis(code: string, days: number = 7) {
  return useQuery<SentimentAnalysis>({
    queryKey: ["sentiment", code, days],
    queryFn: async () => {
      const { data } = await api.get(`/api/analysis/sentiment/${code}`, {
        params: { days },
      });
      return data;
    },
    enabled: !!code,
  });
}

export function useIndustryAnalysis(code: string, days: number = 30) {
  return useQuery<IndustryAnalysis>({
    queryKey: ["industry", code, days],
    queryFn: async () => {
      const { data } = await api.get(`/api/analysis/industry/${code}`, {
        params: { days },
      });
      return data;
    },
    enabled: !!code,
  });
}

// 決策 API
export function useScore(code: string) {
  return useQuery<ScoreData>({
    queryKey: ["score", code],
    queryFn: async () => {
      const { data } = await api.get(`/api/decision/score/${code}`);
      return data;
    },
    enabled: !!code,
  });
}

export function useRadar(code: string) {
  return useQuery<RadarData>({
    queryKey: ["radar", code],
    queryFn: async () => {
      const { data } = await api.get(`/api/decision/radar/${code}`);
      return data;
    },
    enabled: !!code,
  });
}

export function useSignals(stockCode?: string, level: string = "all") {
  return useQuery<Signal[]>({
    queryKey: ["signals", stockCode, level],
    queryFn: async () => {
      const { data } = await api.get("/api/decision/signals", {
        params: { stock_code: stockCode, level },
      });
      return data.signals;
    },
  });
}
