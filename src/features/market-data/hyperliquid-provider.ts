import type { MarketSymbol } from "@/domain/types";
import type {
  Candle,
  FundingSnapshot,
  MarketDataProvider,
  OrderBook,
  PriceHandler,
} from "@/features/market-data/types";

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
const HL_WS_URL = "wss://api.hyperliquid.xyz/ws";
const HL_INFO_TIMEOUT_MS = 8_000;

interface HyperliquidAssetMeta {
  name: string;
}

interface HyperliquidAssetCtx {
  funding?: string;
  premium?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
}

type MetaAndAssetCtxsResponse = [
  { universe?: HyperliquidAssetMeta[] },
  HyperliquidAssetCtx[],
];

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(HL_INFO_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class HyperliquidMarketDataProvider implements MarketDataProvider {
  async getMids(assets: readonly MarketSymbol[]): Promise<Partial<Record<MarketSymbol, string>>> {
    const allMids = await postInfo<Record<string, string>>({ type: "allMids" });
    const mids: Partial<Record<MarketSymbol, string>> = {};

    for (const asset of assets) {
      const mid = allMids[asset];
      if (!mid) throw new Error(`No mid price for ${asset}`);
      mids[asset] = mid;
    }

    return mids;
  }

  async getFundingSnapshots(
    assets: readonly MarketSymbol[],
  ): Promise<Partial<Record<MarketSymbol, FundingSnapshot>>> {
    const data = await postInfo<MetaAndAssetCtxsResponse>({ type: "metaAndAssetCtxs" });
    const [meta, ctxs] = data;
    const universe = meta.universe ?? [];
    const timestamp = Date.now();
    const snapshots: Partial<Record<MarketSymbol, FundingSnapshot>> = {};

    for (const asset of assets) {
      const index = universe.findIndex((item) => item.name === asset);
      const ctx = index >= 0 ? ctxs[index] : undefined;
      snapshots[asset] = {
        asset,
        fundingRate: ctx?.funding ?? "0",
        premium: ctx?.premium,
        previousDayPrice: ctx?.prevDayPx,
        dayNotionalVolume: ctx?.dayNtlVlm,
        timestamp,
      };
    }

    return snapshots;
  }

  async getMid(asset: MarketSymbol): Promise<string> {
    const mids = await this.getMids([asset]);
    const mid = mids[asset];
    if (!mid) throw new Error(`No mid price for ${asset}`);
    return mid;
  }

  async getCandles(
    asset: MarketSymbol,
    interval = "1h",
    lookbackHours = 24,
  ): Promise<Candle[]> {
    const now = Date.now();
    const candles = await postInfo<
      Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>
    >({
      type: "candleSnapshot",
      req: {
        coin: asset,
        interval,
        startTime: now - lookbackHours * 60 * 60 * 1000,
        endTime: now,
      },
    });

    return candles.map((candle) => ({
      time: Math.floor(candle.t / 1000),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v,
    }));
  }

  async getOrderBook(asset: MarketSymbol): Promise<OrderBook> {
    const book = await postInfo<{
      time?: number;
      levels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>];
    }>({
      type: "l2Book",
      coin: asset,
      nSigFigs: null,
    });

    return {
      asset,
      timestamp: book.time ?? Date.now(),
      bids: book.levels[0].map((level) => ({
        price: level.px,
        size: level.sz,
        orders: level.n,
      })),
      asks: book.levels[1].map((level) => ({
        price: level.px,
        size: level.sz,
        orders: level.n,
      })),
    };
  }

  async getFunding(asset: MarketSymbol): Promise<FundingSnapshot> {
    const snapshots = await this.getFundingSnapshots([asset]);
    return snapshots[asset] ?? { asset, fundingRate: "0", timestamp: Date.now() };
  }

  subscribePrices(assets: MarketSymbol[], handler: PriceHandler): () => void {
    if (typeof WebSocket === "undefined") {
      return () => undefined;
    }

    const ws = new WebSocket(HL_WS_URL);
    let closed = false;

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "allMids" },
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as {
        channel?: string;
        data?: { mids?: Record<string, string> } | Record<string, string>;
      };
      if (msg.channel !== "allMids" || !msg.data) return;
      const candidate = "mids" in msg.data ? msg.data.mids : msg.data;
      const mids: Record<string, string> | undefined =
        candidate && typeof candidate === "object" ? (candidate as Record<string, string>) : undefined;
      for (const asset of assets) {
        const mid = mids?.[asset];
        if (mid) handler(asset, mid);
      }
    });

    ws.addEventListener("close", () => {
      closed = true;
    });

    return () => {
      if (!closed) ws.close();
    };
  }
}

export function createMarketDataProvider(): MarketDataProvider {
  return new HyperliquidMarketDataProvider();
}
