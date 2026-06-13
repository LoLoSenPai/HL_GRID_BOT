"use client";

import { useEffect, useRef, useState } from "react";

import { TerminalChart, type ChartOrder } from "@/components/charts/terminal-chart";
import { useHyperliquidLiveMarkets } from "@/components/trading/hyperliquid-live-price-feed";
import { useTerminalLiveSnapshot, type TerminalLiveSnapshot } from "@/components/trading/terminal-live-feed";
import { formatMarketPair } from "@/domain/markets";
import type { GridConfig, MarketSymbol } from "@/domain/types";
import type { ExecutionPosition } from "@/features/execution/types";
import type { Candle } from "@/features/market-data/types";
import { useTerminalStore } from "@/store/use-terminal-store";

interface ChartCandleState {
  asset: MarketSymbol;
  error?: string;
}

export function ReactiveTerminalChart({
  initialConfig,
  candles,
  orders = [],
  className = "",
  initialSnapshot,
}: {
  initialConfig: GridConfig;
  candles: Candle[];
  orders?: ChartOrder[];
  className?: string;
  initialSnapshot: TerminalLiveSnapshot;
}) {
  const initializedRef = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [candleCache, setCandleCache] = useState(() => {
    const initialCache = new Map<MarketSymbol, Candle[]>();
    if (candles.length) initialCache.set(initialConfig.pair, candles);
    return initialCache;
  });
  const [chartState, setChartState] = useState<ChartCandleState>({
    asset: initialConfig.pair,
  });
  const config = useTerminalStore((state) => state.config);
  const updateConfig = useTerminalStore((state) => state.updateConfig);
  const activeConfig = initialized ? config : initialConfig;
  const cachedCandles = candleCache.get(activeConfig.pair);
  const chartReady = Boolean(cachedCandles?.length);
  const chartError = chartState.asset === activeConfig.pair ? chartState.error : undefined;
  const liveSnapshot = useTerminalLiveSnapshot(initialSnapshot);
  const marketFeed = useHyperliquidLiveMarkets(liveSnapshot?.markets ?? initialSnapshot.markets);
  const livePrice = marketFeed.markets.find((market) => market.asset === activeConfig.pair)?.mid;
  const livePosition = findMatchingPosition(
    liveSnapshot?.livePositions ?? initialSnapshot.livePositions,
    activeConfig.pair,
    activeConfig.positionSide,
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    updateConfig(initialConfig);
    setInitialized(true);
  }, [initialConfig, updateConfig]);

  useEffect(() => {
    if (!initialized) return;

    const controller = new AbortController();
    const asset = activeConfig.pair;
    if (candleCache.get(asset)?.length) return;

    async function loadCandles() {
      try {
        const response = await fetch(`/api/market/candles?asset=${encodeURIComponent(asset)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { data?: Candle[]; error?: string };
        if (!controller.signal.aborted) {
          const nextCandles = payload.data ?? [];
          if (response.ok && nextCandles.length) {
            setCandleCache((previous) => {
              if (previous.get(asset)?.length) return previous;
              const next = new Map(previous);
              next.set(asset, nextCandles);
              return next;
            });
          }
          setChartState({
            asset,
            error: response.ok && nextCandles.length ? undefined : payload.error ?? "No candles available",
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setChartState({
            asset,
            error: error instanceof Error ? error.message : "Unable to load candles",
          });
        }
      }
    }

    void loadCandles();

    return () => controller.abort();
  }, [activeConfig.pair, candleCache, initialized]);

  return (
    <div className={`relative h-full min-h-[260px] overflow-hidden rounded-md ${className}`}>
      {chartReady ? (
        <TerminalChart
          config={activeConfig}
          candles={cachedCandles}
          orders={orders}
          livePrice={livePrice}
          position={
            livePosition
              ? {
                  positionSide: livePosition.positionSide,
                  quantity: livePosition.quantity,
                  entryPrice: livePosition.entryPrice,
                  unrealizedPnl: livePosition.unrealizedPnl,
                }
              : undefined
          }
        />
      ) : (
        <ChartLoadingPlaceholder asset={activeConfig.pair} error={chartError} />
      )}
    </div>
  );
}

function findMatchingPosition(positions: ExecutionPosition[], asset: MarketSymbol, positionSide: GridConfig["positionSide"]) {
  return positions.find((position) => position.asset === asset && position.positionSide === positionSide);
}

function ChartLoadingPlaceholder({ asset, error }: { asset: MarketSymbol; error?: string }) {
  return (
    <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-md border border-border/60 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:80px_54px]">
      <div className="flex items-center gap-3 rounded-md border bg-background/85 px-3 py-2 text-xs text-muted-foreground shadow-sm">
        {error ? null : <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />}
        <span>{error ? `Candles unavailable: ${error}` : `Loading ${formatMarketPair(asset)} candles`}</span>
      </div>
    </div>
  );
}
