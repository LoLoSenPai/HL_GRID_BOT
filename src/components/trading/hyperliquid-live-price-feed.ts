"use client";

import { useEffect, useState } from "react";

import type { MarketSnapshot, MarketSymbol } from "@/domain/types";

const HL_WS_URL = "wss://api.hyperliquid.xyz/ws";
const RECONNECT_MS = 2_500;

export type HyperliquidFeedTransport = "rest_fallback" | "connecting" | "hyperliquid_ws" | "disconnected";

export interface HyperliquidLiveFeedState {
  markets: MarketSnapshot[];
  transport: HyperliquidFeedTransport;
  connected: boolean;
  lastMessageAt?: string;
  error?: string;
}

type Subscriber = (state: HyperliquidLiveFeedState) => void;

const subscribers = new Set<Subscriber>();

let state: HyperliquidLiveFeedState = {
  markets: [],
  transport: "rest_fallback",
  connected: false,
};
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let shouldRun = false;

export function useHyperliquidLiveMarkets(fallbackMarkets: MarketSnapshot[]) {
  const [snapshot, setSnapshot] = useState<HyperliquidLiveFeedState>(() => ({
    ...state,
    markets: state.markets.length ? state.markets : fallbackMarkets,
  }));

  useEffect(() => {
    subscribers.add(setSnapshot);
    window.queueMicrotask(() => {
      if (subscribers.has(setSnapshot)) setSnapshot(state);
    });
    startHyperliquidFeed();

    return () => {
      subscribers.delete(setSnapshot);
      if (!subscribers.size) stopHyperliquidFeed();
    };
  }, []);

  useEffect(() => {
    mergeFallbackMarkets(fallbackMarkets);
    window.queueMicrotask(() => {
      if (subscribers.has(setSnapshot)) setSnapshot(state);
    });
  }, [fallbackMarkets]);

  return snapshot;
}

export function useHyperliquidLivePrice(asset: MarketSymbol, fallbackMarkets: MarketSnapshot[]) {
  const feed = useHyperliquidLiveMarkets(fallbackMarkets);
  return {
    ...feed,
    market: feed.markets.find((market) => market.asset === asset),
  };
}

function startHyperliquidFeed() {
  shouldRun = true;
  if (ws || reconnectTimer !== null) return;
  connect();
}

function stopHyperliquidFeed() {
  shouldRun = false;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

function connect() {
  if (!shouldRun || typeof WebSocket === "undefined") return;

  publish({
    transport: state.markets.length ? "rest_fallback" : "connecting",
    connected: false,
    error: undefined,
  });

  ws = new WebSocket(HL_WS_URL);

  ws.addEventListener("open", () => {
    publish({ transport: "hyperliquid_ws", connected: true, error: undefined });
    ws?.send(
      JSON.stringify({
        method: "subscribe",
        subscription: { type: "allMids" },
      }),
    );
  });

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as {
        channel?: string;
        data?: { mids?: Record<string, string> } | Record<string, string>;
      };
      if (message.channel !== "allMids" || !message.data) return;
      const mids = midsFromPayload(message.data);
      if (!mids) return;
      applyMids(mids);
    } catch (error) {
      publish({ error: error instanceof Error ? error.message : "Invalid Hyperliquid WS message" });
    }
  });

  ws.addEventListener("close", () => {
    ws = null;
    publish({ transport: "disconnected", connected: false });
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    publish({ transport: state.markets.length ? "rest_fallback" : "disconnected", connected: false, error: "Hyperliquid WS error" });
  });
}

function scheduleReconnect() {
  if (!shouldRun || reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function mergeFallbackMarkets(markets: MarketSnapshot[]) {
  if (!markets.length) return;
  const merged = new Map<MarketSymbol, MarketSnapshot>(state.markets.map((market) => [market.asset, market]));
  for (const market of markets) {
    const current = merged.get(market.asset);
    if (!current || !hasUsableMid(current)) {
      merged.set(market.asset, market);
    } else {
      const currentTimestamp = Number(current.timestamp) || 0;
      const fallbackTimestamp = Number(market.timestamp) || 0;
      const keepLiveMid = state.connected || state.transport === "hyperliquid_ws" || currentTimestamp >= fallbackTimestamp;
      merged.set(market.asset, {
        ...market,
        mid: keepLiveMid ? current.mid : market.mid,
        timestamp: keepLiveMid ? current.timestamp : market.timestamp,
      });
    }
  }
  publish({ markets: Array.from(merged.values()) });
}

function applyMids(mids: Record<string, string>) {
  const timestamp = Date.now();
  const knownMarkets = state.markets.length ? state.markets : Object.entries(mids).map(([asset, mid]) => ({
    asset: asset as MarketSymbol,
    mid,
    funding: "0",
    timestamp,
  }));
  const nextMarkets = knownMarkets.map((market) => {
    const mid = mids[market.asset];
    return mid
      ? {
          ...market,
          mid,
          timestamp,
        }
      : market;
  });

  publish({
    markets: nextMarkets,
    transport: "hyperliquid_ws",
    connected: true,
    lastMessageAt: new Date(timestamp).toISOString(),
    error: undefined,
  });
}

function publish(patch: Partial<HyperliquidLiveFeedState>) {
  state = {
    ...state,
    ...patch,
  };
  for (const subscriber of subscribers) subscriber(state);
}

function midsFromPayload(payload: unknown): Record<string, string> | undefined {
  if (!isRecord(payload)) return undefined;
  const nestedMids = payload.mids;
  if (isStringRecord(nestedMids)) return nestedMids;
  return isStringRecord(payload) ? payload : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function hasUsableMid(market: MarketSnapshot): boolean {
  const mid = Number(market.mid);
  return Number.isFinite(mid) && mid > 0;
}
