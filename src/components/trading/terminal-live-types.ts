import type { MarketSnapshot, MarketSymbol } from "@/domain/types";
import type { BotPerformanceSummary } from "@/features/bots/performance";
import type { ExecutionPosition } from "@/features/execution/types";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";

export interface TerminalLiveOrder {
  id: string;
  botId: string;
  asset: MarketSymbol;
  side: "buy" | "sell";
  status: string;
  quantity: string;
  price: string | null;
  reduceOnly: boolean;
}

export interface TerminalLiveFill {
  id: string;
  botId: string;
  asset: MarketSymbol;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
  realizedPnl: string;
  executedAt: string;
}

export interface TerminalLiveSnapshot {
  checkedAt: string;
  markets: MarketSnapshot[];
  challenge: ProprChallengeSummary;
  bots: BotPerformanceSummary[];
  livePositions: ExecutionPosition[];
  orders: TerminalLiveOrder[];
  fills: TerminalLiveFill[];
}
