import { ulid } from "ulid";

import { getSqlite } from "@/db/client";
import { ensureDatabase } from "@/db/init";
import { decimal, toDecimalString } from "@/domain/decimal";
import { isBuilderMarket } from "@/domain/markets";
import { SUPPORTED_MARKETS, type GridConfig, type MarketSnapshot, type MarketSymbol } from "@/domain/types";
import { sampleMarkets } from "@/features/bots/sample-data";
import { createMarketDataProvider, HyperliquidMarketDataProvider } from "@/features/market-data/hyperliquid-provider";
import type { Candle } from "@/features/market-data/types";
import { logger } from "@/lib/logger";

const MARKET_SOURCE = "hyperliquid_public_info";
const FALLBACK_SOURCE = "sample_fallback";
const DEFAULT_CANDLE_INTERVAL = "15m";
const DEFAULT_CANDLE_LOOKBACK_HOURS = 24;

export interface MarketSnapshotFeed {
  data: MarketSnapshot[];
  source: typeof MARKET_SOURCE | typeof FALLBACK_SOURCE;
  error?: string;
}

export async function getMarketSnapshots(
  assets: readonly MarketSymbol[] = SUPPORTED_MARKETS,
): Promise<MarketSnapshot[]> {
  return (await getMarketSnapshotFeed(assets)).data;
}

export async function getMarketSnapshotFeed(
  assets: readonly MarketSymbol[] = SUPPORTED_MARKETS,
): Promise<MarketSnapshotFeed> {
  try {
    const data = await loadMarketSnapshots(assets);
    persistMarketSnapshots(data);
    return { data, source: MARKET_SOURCE };
  } catch (error) {
    const message = errorMessage(error);
    logger.warn("market_data.snapshot_fallback", { error: message });
    return {
      data: fallbackMarketSnapshots(assets),
      source: FALLBACK_SOURCE,
      error: message,
    };
  }
}

export async function getCandlesForConfig(
  config: GridConfig,
  interval = DEFAULT_CANDLE_INTERVAL,
  lookbackHours = DEFAULT_CANDLE_LOOKBACK_HOURS,
): Promise<Candle[]> {
  const provider = createMarketDataProvider();

  try {
    const candles = await provider.getCandles(config.pair, interval, lookbackHours);
    if (candles.length >= 2) return candles;
    throw new Error(`Hyperliquid returned ${candles.length} candles`);
  } catch (error) {
    logger.warn("market_data.candle_fallback", {
      asset: config.pair,
      error: errorMessage(error),
    });
    return buildFallbackCandles(config);
  }
}

export function buildFallbackCandles(config: GridConfig): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const reference = decimal(config.lowerPrice).plus(config.upperPrice).div(2).toNumber();

  return Array.from({ length: 96 }, (_, index) => {
    const time = now - (96 - index) * 900;
    const wave = Math.sin(index / 6) * reference * 0.012;
    const drift = (index - 48) * reference * 0.00018;
    const open = reference + wave + drift;
    const close = open + Math.cos(index / 5) * reference * 0.004;
    const high = Math.max(open, close) + reference * 0.006;
    const low = Math.min(open, close) - reference * 0.006;

    return {
      time,
      open: toDecimalString(open, 6),
      high: toDecimalString(high, 6),
      low: toDecimalString(low, 6),
      close: toDecimalString(close, 6),
      volume: "0",
    };
  });
}

async function loadMarketSnapshots(assets: readonly MarketSymbol[]): Promise<MarketSnapshot[]> {
  const provider = createMarketDataProvider();
  const timestamp = Date.now();

  if (provider instanceof HyperliquidMarketDataProvider) {
    const [mids, fundingSnapshots, builderContexts] = await Promise.all([
      provider.getMids(assets),
      provider.getFundingSnapshots(assets),
      loadBuilderCandleContexts(provider, assets.filter(isBuilderMarket)),
    ]);

    return assets.map((asset) => {
      const builderContext = builderContexts.get(asset);
      const mid = mids[asset] ?? builderContext?.mid;
      if (!mid) throw new Error(`No mid price for ${asset}`);
      return {
        asset,
        mid,
        funding: fundingSnapshots[asset]?.fundingRate ?? "0",
        change24hPct: change24hPct(mid, fundingSnapshots[asset]?.previousDayPrice ?? builderContext?.previousDayPrice),
        volume24h: fundingSnapshots[asset]?.dayNotionalVolume ?? builderContext?.dayNotionalVolume,
        timestamp,
      };
    });
  }

  return Promise.all(
    assets.map(async (asset) => {
      const [mid, funding] = await Promise.all([
        provider.getMid(asset),
        provider.getFunding(asset).catch(() => undefined),
      ]);
      return {
        asset,
        mid,
        funding: funding?.fundingRate ?? "0",
        change24hPct: change24hPct(mid, funding?.previousDayPrice),
        volume24h: funding?.dayNotionalVolume,
        timestamp,
      };
    }),
  );
}

async function loadBuilderCandleContexts(
  provider: HyperliquidMarketDataProvider,
  assets: readonly MarketSymbol[],
): Promise<Map<MarketSymbol, { mid?: string; previousDayPrice?: string; dayNotionalVolume?: string }>> {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      try {
        const candles = await provider.getCandles(asset, "1h", 24);
        const first = candles[0];
        const last = candles.at(-1);
        const volume = candles.reduce((total, candle) => total.plus(candle.volume || "0"), decimal(0));
        return [
          asset,
          {
            mid: last?.close,
            previousDayPrice: first?.open,
            dayNotionalVolume: toDecimalString(volume, 2),
          },
        ] as const;
      } catch (error) {
        logger.warn("market_data.builder_context_failed", {
          asset,
          error: errorMessage(error),
        });
        return [asset, undefined] as const;
      }
    }),
  );

  const contexts = new Map<
    MarketSymbol,
    { mid?: string; previousDayPrice?: string; dayNotionalVolume?: string }
  >();
  for (const [asset, context] of entries) {
    if (context) contexts.set(asset, context);
  }
  return contexts;
}

function fallbackMarketSnapshots(assets: readonly MarketSymbol[]): MarketSnapshot[] {
  const timestamp = Date.now();
  const cached = latestCachedMarketSnapshots(assets);
  const samples = new Map(sampleMarkets.map((market) => [market.asset, market]));

  return assets.map((asset) => {
    const cachedSnapshot = cached.get(asset);
    if (cachedSnapshot) return cachedSnapshot;

    const sample = samples.get(asset);
    return {
      asset,
      mid: sample?.mid ?? "0",
      funding: sample?.funding ?? "0",
      change24hPct: sample?.change24hPct,
      volume24h: sample?.volume24h,
      timestamp,
    };
  });
}

function latestCachedMarketSnapshots(assets: readonly MarketSymbol[]): Map<MarketSymbol, MarketSnapshot> {
  try {
    ensureDatabase();
    const snapshots = new Map<MarketSymbol, MarketSnapshot>();
    const db = getSqlite();

    for (const asset of assets) {
      const row = db
        .prepare(
          `
          SELECT asset, mid, funding, payload, created_at
          FROM market_snapshots
          WHERE asset = ?
          ORDER BY created_at DESC
          LIMIT 1
        `,
        )
        .get(asset) as
        | {
            asset: MarketSymbol;
            mid: string;
            funding: string | null;
            payload: string | null;
            created_at: string;
          }
        | undefined;

      if (!row) continue;
      const payload = row.payload ? (JSON.parse(row.payload) as Partial<MarketSnapshot>) : {};
      snapshots.set(asset, {
        asset,
        mid: row.mid,
        funding: row.funding ?? undefined,
        change24hPct: payload.change24hPct,
        volume24h: payload.volume24h,
        timestamp: Date.parse(row.created_at) || Date.now(),
      });
    }

    return snapshots;
  } catch (error) {
    logger.warn("market_data.cached_snapshot_fallback_failed", { error: errorMessage(error) });
    return new Map();
  }
}

function persistMarketSnapshots(snapshots: MarketSnapshot[]) {
  try {
    ensureDatabase();
    const db = getSqlite();
    const insert = db.prepare(
      `
      INSERT INTO market_snapshots (id, asset, mid, funding, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    );
    const tx = db.transaction(() => {
      for (const snapshot of snapshots) {
        insert.run(
          `ms_${ulid().toLowerCase()}`,
          snapshot.asset,
          snapshot.mid,
          snapshot.funding ?? null,
          JSON.stringify({
            source: MARKET_SOURCE,
            timestamp: snapshot.timestamp,
            change24hPct: snapshot.change24hPct,
            volume24h: snapshot.volume24h,
          }),
          new Date(snapshot.timestamp).toISOString(),
        );
      }
    });
    tx();
  } catch (error) {
    logger.warn("market_data.snapshot_persist_failed", { error: errorMessage(error) });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown market data error";
}

function change24hPct(mid: string, previousDayPrice?: string): string | undefined {
  if (!previousDayPrice || decimal(previousDayPrice).lte(0)) return undefined;
  return toDecimalString(decimal(mid).minus(previousDayPrice).div(previousDayPrice).mul(100), 2);
}
