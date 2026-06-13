"use client";

import { formatMarketSymbol } from "@/domain/markets";
import type { MarketSnapshot, MarketSymbol } from "@/domain/types";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { useTerminalStore } from "@/store/use-terminal-store";
import { useHyperliquidLiveMarkets } from "@/components/trading/hyperliquid-live-price-feed";
import { useTerminalLiveSnapshot, type TerminalLiveSnapshot } from "@/components/trading/terminal-live-feed";

export function ReactiveTerminalMetrics({
  initialPair,
  markets,
  challenge,
  initialSnapshot,
}: {
  initialPair: MarketSymbol;
  markets: MarketSnapshot[];
  challenge: ProprChallengeSummary;
  initialSnapshot: TerminalLiveSnapshot;
}) {
  const selectedPair = useTerminalStore((state) => state.config.pair) ?? initialPair;
  const liveSnapshot = useTerminalLiveSnapshot(initialSnapshot);
  const marketFeed = useHyperliquidLiveMarkets(liveSnapshot?.markets ?? markets);
  const liveMarkets = marketFeed.markets;
  const liveChallenge = liveSnapshot?.challenge ?? challenge;
  const market = liveMarkets.find((snapshot) => snapshot.asset === selectedPair) ?? {
    asset: selectedPair,
    mid: "0",
    funding: "0",
    timestamp: 0,
  };
  const challengePnl = formatSignedNumber(Number(liveChallenge.realizedPnl) + Number(liveChallenge.unrealizedPnl));
  const change24h = Number(market.change24hPct);
  const pnl = Number(challengePnl);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <TerminalMetric label="Pair" value={formatMarketSymbol(selectedPair)} strong />
      <TerminalMetric label="Price" value={market.mid} strong />
      <TerminalMetric label="24h" value={formatChange(market.change24hPct)} tone={Number.isFinite(change24h) ? (change24h >= 0 ? "up" : "down") : undefined} />
      <TerminalMetric label="Funding" value={formatFunding(market.funding)} />
      <TerminalMetric label="Equity" value={liveChallenge.equity} />
      <TerminalMetric label="PnL" value={challengePnl} tone={Number.isFinite(pnl) ? (pnl >= 0 ? "up" : "down") : undefined} />
      <TerminalMetric label="Feed" value={marketFeed.connected ? "WS" : "REST"} tone={marketFeed.connected ? "up" : undefined} />
    </div>
  );
}

function TerminalMetric({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "up" | "down";
}) {
  return (
    <div className="min-w-[78px]">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={[
          "metric-mono mt-0.5 whitespace-nowrap",
          strong ? "text-lg font-semibold" : "text-sm font-medium",
          tone === "up" ? "text-primary" : "",
          tone === "down" ? "text-destructive" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function formatChange(value?: string): string {
  if (!value) return "n/a";
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function formatFunding(value?: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${(parsed * 100).toFixed(4)}%`;
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
