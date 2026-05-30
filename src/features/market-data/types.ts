import type { DecimalString, MarketSymbol } from "@/domain/types";

export interface Candle {
  time: number;
  open: DecimalString;
  high: DecimalString;
  low: DecimalString;
  close: DecimalString;
  volume: DecimalString;
}

export interface OrderBookLevel {
  price: DecimalString;
  size: DecimalString;
  orders: number;
}

export interface OrderBook {
  asset: MarketSymbol;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface FundingSnapshot {
  asset: MarketSymbol;
  fundingRate: DecimalString;
  premium?: DecimalString;
  previousDayPrice?: DecimalString;
  dayNotionalVolume?: DecimalString;
  timestamp: number;
}

export type PriceHandler = (asset: MarketSymbol, price: DecimalString) => void;

export interface MarketDataProvider {
  getMid(asset: MarketSymbol): Promise<DecimalString>;
  getCandles(asset: MarketSymbol, interval: string, lookbackHours: number): Promise<Candle[]>;
  getOrderBook(asset: MarketSymbol): Promise<OrderBook>;
  getFunding(asset: MarketSymbol): Promise<FundingSnapshot>;
  subscribePrices(assets: MarketSymbol[], handler: PriceHandler): () => void;
}
