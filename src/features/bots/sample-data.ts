import type { GridConfig, MarketSnapshot } from "@/domain/types";

export const defaultBotConfig: GridConfig = {
  pair: "BTC",
  positionSide: "long",
  lowerPrice: "73000",
  upperPrice: "76000",
  gridCount: 16,
  capitalAllocation: "1000",
  leverage: 2,
  spacing: "arithmetic",
  orderSize: "0",
  takeProfit: "88000",
  stopLoss: "66000",
  maxDrawdownPct: "8",
  challengeDailyLossStopPct: "2.75",
  autoPauseOutOfRange: true,
  autoRecenter: false,
  mode: "paper",
};

export const sampleMarkets: MarketSnapshot[] = [
  {
    asset: "BTC",
    mid: "100240",
    funding: "0.00012",
    change24hPct: "1.18",
    volume24h: "1850000000",
    timestamp: Date.now(),
  },
  {
    asset: "ETH",
    mid: "3620",
    funding: "0.00008",
    change24hPct: "-0.42",
    volume24h: "910000000",
    timestamp: Date.now(),
  },
  {
    asset: "SOL",
    mid: "164.5",
    funding: "0.00016",
    change24hPct: "2.06",
    volume24h: "320000000",
    timestamp: Date.now(),
  },
  {
    asset: "HYPE",
    mid: "32.1",
    funding: "0.00021",
    change24hPct: "0.87",
    volume24h: "140000000",
    timestamp: Date.now(),
  },
];
