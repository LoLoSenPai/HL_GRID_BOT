export const SUPPORTED_MARKETS = [
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "xyz:CRCL",
  "xyz:TSLA",
  "xyz:GOLD",
  "xyz:CL",
  "xyz:NVDA",
  "xyz:MU",
] as const;

export type MarketSymbol = (typeof SUPPORTED_MARKETS)[number];

export type TradingMode = "mock" | "paper" | "propr_live";

export type BotStatus =
  | "draft"
  | "paper"
  | "running"
  | "live"
  | "paused"
  | "out_of_range"
  | "error"
  | "stopped";

export type GridSpacing = "arithmetic" | "geometric";

export type OrderSide = "buy" | "sell";

export type PositionSide = "long" | "short";

export type OrderType =
  | "market"
  | "limit"
  | "stop_market"
  | "stop_limit"
  | "take_profit_market"
  | "take_profit_limit";

export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX";

export type DecimalString = string;

export interface GridConfig {
  pair: MarketSymbol;
  positionSide: PositionSide;
  lowerPrice: DecimalString;
  upperPrice: DecimalString;
  gridCount: number;
  capitalAllocation: DecimalString;
  leverage: number;
  spacing: GridSpacing;
  orderSize: DecimalString;
  takeProfit?: DecimalString;
  stopLoss?: DecimalString;
  maxDrawdownPct: DecimalString;
  autoPauseOutOfRange: boolean;
  autoRecenter: boolean;
  mode: TradingMode;
}

export interface Bot {
  id: string;
  name: string;
  status: BotStatus;
  config: GridConfig;
  createdAt: string;
  updatedAt: string;
}

export interface GridLevel {
  id: string;
  index: number;
  price: DecimalString;
  side: OrderSide;
  quantity: DecimalString;
}

export interface RuntimeMetrics {
  equity: DecimalString;
  pnl: DecimalString;
  realizedPnl: DecimalString;
  unrealizedPnl: DecimalString;
  volume: DecimalString;
  exposure: DecimalString;
  drawdownPct: DecimalString;
  openOrders: number;
  fills: number;
}

export interface ActivityEvent {
  id: string;
  botId?: string;
  type: string;
  severity: "info" | "warning" | "error" | "success";
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface MarketSnapshot {
  asset: MarketSymbol;
  mid: DecimalString;
  funding?: DecimalString;
  change24hPct?: DecimalString;
  volume24h?: DecimalString;
  timestamp: number;
}
