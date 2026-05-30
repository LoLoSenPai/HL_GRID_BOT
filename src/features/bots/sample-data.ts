import type {
  ActivityEvent,
  Bot,
  GridConfig,
  MarketSnapshot,
  RuntimeMetrics,
} from "@/domain/types";

export const defaultBotConfig: GridConfig = {
  pair: "BTC",
  lowerPrice: "73000",
  upperPrice: "76000",
  gridCount: 16,
  capitalAllocation: "2500",
  leverage: 2,
  spacing: "arithmetic",
  orderSize: "75",
  takeProfit: "88000",
  stopLoss: "66000",
  maxDrawdownPct: "8",
  autoPauseOutOfRange: true,
  autoRecenter: false,
  mode: "paper",
};

export const sampleBots: Bot[] = [
  {
    id: "bot_btc_range_v1",
    name: "BTC Range V1",
    status: "paper",
    config: defaultBotConfig,
    createdAt: "2026-05-30T12:00:00.000Z",
    updatedAt: "2026-05-30T15:00:00.000Z",
  },
  {
    id: "bot_eth_compact",
    name: "ETH Compact Grid",
    status: "paused",
    config: {
      ...defaultBotConfig,
      pair: "ETH",
      lowerPrice: "3300",
      upperPrice: "3950",
      gridCount: 14,
      capitalAllocation: "1500",
      orderSize: "50",
      leverage: 2,
    },
    createdAt: "2026-05-29T11:00:00.000Z",
    updatedAt: "2026-05-30T13:20:00.000Z",
  },
  {
    id: "bot_sol_lab",
    name: "SOL Lab Sweep",
    status: "draft",
    config: {
      ...defaultBotConfig,
      pair: "SOL",
      lowerPrice: "145",
      upperPrice: "188",
      gridCount: 12,
      capitalAllocation: "800",
      orderSize: "25",
      leverage: 1,
      mode: "mock",
    },
    createdAt: "2026-05-30T09:00:00.000Z",
    updatedAt: "2026-05-30T09:00:00.000Z",
  },
];

export const sampleMetrics: RuntimeMetrics = {
  equity: "10000",
  pnl: "142.42",
  realizedPnl: "54.11",
  unrealizedPnl: "88.31",
  volume: "48520",
  exposure: "3720",
  drawdownPct: "1.8",
  openOrders: 22,
  fills: 39,
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

export const sampleEvents: ActivityEvent[] = [
  {
    id: "evt_1",
    botId: "bot_btc_range_v1",
    type: "bot.started",
    severity: "success",
    message: "BTC Range V1 entered paper mode.",
    createdAt: "2026-05-30T15:00:00.000Z",
  },
  {
    id: "evt_2",
    botId: "bot_btc_range_v1",
    type: "order.created",
    severity: "info",
    message: "Placed buy limit at 98200.",
    createdAt: "2026-05-30T15:02:00.000Z",
  },
  {
    id: "evt_3",
    botId: "bot_eth_compact",
    type: "risk.paused",
    severity: "warning",
    message: "Bot paused manually before live validation.",
    createdAt: "2026-05-30T13:20:00.000Z",
  },
  {
    id: "evt_4",
    type: "propr.auth_blocked",
    severity: "error",
    message: "Propr live mode blocked: API key returned 401 Unauthorized.",
    createdAt: "2026-05-30T15:18:00.000Z",
  },
];
