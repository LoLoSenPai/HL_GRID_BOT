"use client";

import { MetricCard } from "@/components/trading/metric-card";
import { formatMarketSymbol } from "@/domain/markets";
import type { MarketSnapshot, MarketSymbol, RuntimeMetrics } from "@/domain/types";
import { useTerminalStore } from "@/store/use-terminal-store";

export function ReactiveTerminalMetrics({
  initialPair,
  markets,
  metrics,
}: {
  initialPair: MarketSymbol;
  markets: MarketSnapshot[];
  metrics: RuntimeMetrics;
}) {
  const selectedPair = useTerminalStore((state) => state.config.pair) ?? initialPair;
  const market = markets.find((snapshot) => snapshot.asset === selectedPair) ?? {
    asset: selectedPair,
    mid: "0",
    funding: "0",
    timestamp: 0,
  };

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      <MetricCard label="Pair" value={formatMarketSymbol(selectedPair)} />
      <MetricCard label="Price" value={market.mid} />
      <MetricCard label="24h" value={formatChange(market.change24hPct)} />
      <MetricCard label="Funding" value={formatFunding(market.funding)} />
      <MetricCard label="Equity" value={metrics.equity} />
      <MetricCard label="PnL" value={`${Number(metrics.pnl) >= 0 ? "+" : ""}${metrics.pnl}`} />
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
