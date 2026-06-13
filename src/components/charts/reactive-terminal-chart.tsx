"use client";

import { useEffect, useRef, useState } from "react";

import { TerminalChart, type ChartFill, type ChartOrder } from "@/components/charts/terminal-chart";
import { useHyperliquidLiveMarkets } from "@/components/trading/hyperliquid-live-price-feed";
import {
  useTerminalLiveSnapshot,
  type TerminalLiveFill,
  type TerminalLiveOrder,
  type TerminalLiveSnapshot,
} from "@/components/trading/terminal-live-feed";
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
  activeBotId,
}: {
  initialConfig: GridConfig;
  candles: Candle[];
  orders?: ChartOrder[];
  className?: string;
  initialSnapshot: TerminalLiveSnapshot;
  activeBotId?: string;
}) {
  const initializedRef = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [candleCache, setCandleCache] = useState(() => {
    const initialCache = new Map<MarketSymbol, Candle[]>();
    if (hasUsableCandles(candles)) initialCache.set(initialConfig.pair, candles);
    return initialCache;
  });
  const [chartState, setChartState] = useState<ChartCandleState>({
    asset: initialConfig.pair,
  });
  const config = useTerminalStore((state) => state.config);
  const updateConfig = useTerminalStore((state) => state.updateConfig);
  const activeConfig = initialized ? config : initialConfig;
  const cachedCandles = candleCache.get(activeConfig.pair);
  const chartReady = hasUsableCandles(cachedCandles);
  const chartError = chartState.asset === activeConfig.pair ? chartState.error : undefined;
  const liveSnapshot = useTerminalLiveSnapshot(initialSnapshot);
  const marketFeed = useHyperliquidLiveMarkets(liveSnapshot?.markets ?? initialSnapshot.markets);
  const livePrice = marketFeed.markets.find((market) => market.asset === activeConfig.pair)?.mid;
  const chartOrders = resolveChartOrders({
    activeBotId,
    asset: activeConfig.pair,
    fallback: orders,
    liveOrders: liveSnapshot?.orders ?? initialSnapshot.orders ?? [],
  });
  const chartFills = resolveChartFills({
    activeBotId,
    asset: activeConfig.pair,
    liveFills: liveSnapshot?.fills ?? initialSnapshot.fills ?? [],
  });
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
          if (response.ok && hasUsableCandles(nextCandles)) {
            setCandleCache((previous) => {
              if (hasUsableCandles(previous.get(asset))) return previous;
              const next = new Map(previous);
              next.set(asset, nextCandles);
              return next;
            });
          }
          setChartState({
            asset,
            error: response.ok && hasUsableCandles(nextCandles) ? undefined : payload.error ?? "No candles available",
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
          orders={chartOrders}
          fills={chartFills}
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

function resolveChartOrders({
  activeBotId,
  asset,
  fallback,
  liveOrders,
}: {
  activeBotId?: string;
  asset: MarketSymbol;
  fallback: ChartOrder[];
  liveOrders: TerminalLiveOrder[];
}): ChartOrder[] {
  if (!activeBotId) return fallback;
  return liveOrders
    .filter((order) => order.botId === activeBotId && order.asset === asset)
    .map((order) => ({
      id: order.id,
      side: order.side,
      status: order.status,
      quantity: order.quantity,
      price: order.price,
      reduceOnly: order.reduceOnly,
    }));
}

function hasUsableCandles(candles?: Candle[]): boolean {
  if (!candles || candles.length < 2) return false;
  return candles.filter((candle) =>
    [candle.time, candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(Number(value))),
  ).length >= 2;
}

function resolveChartFills({
  activeBotId,
  asset,
  liveFills,
}: {
  activeBotId?: string;
  asset: MarketSymbol;
  liveFills: TerminalLiveFill[];
}): ChartFill[] {
  if (!activeBotId) return [];
  return liveFills
    .filter((fill) => fill.botId === activeBotId && fill.asset === asset)
    .map((fill) => ({
      id: fill.id,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      executedAt: fill.executedAt,
    }));
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
