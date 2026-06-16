// 股票相關類型
export interface Stock {
  code: string;
  name: string;
  industry?: string;
  market?: string;
  stock_type?: string;
}

export interface KLinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChipDataPoint {
  date: string;
  foreign_net_buy: number;
  invest_trust_net_buy: number;
  proprietary_net_buy: number;
  margin_balance: number;
  short_balance: number;
}

export interface PreMarketIndex {
  name: string;
  value: number;
  change: number;
  change_percent: number;
}

export interface PreMarketData {
  international_indices: PreMarketIndex[];
  adr_performance: any[];
}

// 分析相關類型
export interface TechnicalAnalysis {
  stock_code: string;
  score: number;
  signal: string;
  ma_alignment: string;
  trend: {
    direction: string;
    strength: number;
  };
  rsi: number;
  macd: {
    macd_line: number;
    signal_line: number;
    histogram: number;
  };
  kdj: {
    k: number;
    d: number;
    j: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
  volume: {
    avg_volume: number;
    current_volume: number;
    ratio: number;
  };
}

export interface ChipAnalysis {
  stock_code: string;
  score: number;
  signal: string;
  dealer_flow: {
    foreign_net_buy: number;
    invest_trust_net_buy: number;
    proprietary_net_buy: number;
    foreign_consecutive_days: number;
    invest_trust_consecutive_days: number;
    trend: string;
    signal: string;
  };
  margin_trading: {
    margin_balance: number;
    short_balance: number;
    margin_net_buy: number;
    short_net_sell: number;
    margin_ratio: number;
    margin_trend: string;
    short_trend: string;
    signal: string;
  };
  concentration: {
    concentration_ratio: number;
    large_holder_trend: string;
    retail_ratio: number;
    signal: string;
  };
}

export interface SentimentAnalysis {
  stock_code: string;
  score: number;
  signal: string;
  news_sentiment: {
    positive_ratio: number;
    negative_ratio: number;
    neutral_ratio: number;
    avg_sentiment_score: number;
    trend: string;
    signal: string;
    news_count: number;
    keywords: string[];
  };
  market_sentiment: {
    overall_score: number;
    fear_greed_index: number;
    signal: string;
  };
  news?: Array<{
    title: string;
    source: string;
    time: string | null;
    sentiment_score: number;
    summary: string;
  }>;
  method?: string;
}

export interface IndustryAnalysis {
  stock_code: string;
  score: number;
  signal: string;
  peers: {
    industry: string;
    peers: Array<{ code: string; name: string; return: number }>;
    peer_avg_return: number;
    stock_return: number;
    relative_strength: number;
    rank: number;
    total_peers: number;
    signal: string;
  };
  chain: {
    upstream_industries: string[];
    downstream_industries: string[];
    chain_position: string;
    transmission_effect: string;
  };
  rotation: {
    current_industry: string;
    rotation_phase: string;
    hot_industries: string[];
    cold_industries: string[];
    capital_flow: string;
    signal: string;
  };
}

// 決策相關類型
export interface DownsideExtension {
  price: number;
  pct: number;
  note: string;
}

export interface OperationGuideData {
  entry_note: string;
  stop_loss: number;
  stop_loss_pct: number;
  target: number;
  target_pct: number;
  rr_ratio: number;
  hold_period: string;
  downside_extension?: DownsideExtension | null;
}

export interface ConfidenceData {
  level: "high" | "medium" | "low";
  score: number;
  reason: string;
}

export interface ScoreData {
  stock_code: string;
  total_score: number;
  technical_score: number;
  chip_score: number;
  fundamental_score: number;
  sentiment_score: number;
  health_level: string;
  weights: Record<string, number>;
  current_price?: number | null;
  atr_14?: number | null;
  support?: number | null;
  resistance?: number | null;
  operation?: OperationGuideData | null;
  confidence?: ConfidenceData | null;
}

export interface RadarData {
  stock_code: string;
  radar: {
    value: number;
    momentum: number;
    chip: number;
    growth: number;
    resistance: number;
  };
}

export interface Signal {
  stock_code: string;
  level: string;
  action: string;
  reason: string;
  scores: {
    total: number;
    technical: number;
    chip: number;
    sentiment: number;
    fundamental: number;
  };
}

// 認證相關類型
export interface User {
  id: string;
  username: string;
  email: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// WebSocket 即時數據類型
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
  interval?: string;
  market_open?: boolean;
  message?: string;
  data?: CandleUpdate;
  timestamp?: string;
}
