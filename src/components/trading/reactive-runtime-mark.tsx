"use client";

import { useHyperliquidLiveMarkets } from "@/components/trading/hyperliquid-live-price-feed";
import { useTerminalLiveSnapshot, type TerminalLiveSnapshot } from "@/components/trading/terminal-live-feed";
import type { MarketSymbol } from "@/domain/types";
import { useTerminalStore } from "@/store/use-terminal-store";

export function ReactiveRuntimeMark({
  initialPair,
  fallback,
  initialSnapshot,
}: {
  initialPair: MarketSymbol;
  fallback?: string;
  initialSnapshot: TerminalLiveSnapshot;
}) {
  const selectedPair = useTerminalStore((state) => state.config.pair) ?? initialPair;
  const liveSnapshot = useTerminalLiveSnapshot(initialSnapshot);
  const marketFeed = useHyperliquidLiveMarkets(liveSnapshot?.markets ?? initialSnapshot.markets);
  const market = marketFeed.markets.find((snapshot) => snapshot.asset === selectedPair);

  return <span className="metric-mono text-foreground">{market?.mid ?? fallback ?? "not synced"}</span>;
}
