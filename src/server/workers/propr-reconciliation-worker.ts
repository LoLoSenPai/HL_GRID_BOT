import { pathToFileURL } from "node:url";

import WebSocket from "ws";

import { getSetting, listBots, listEvents, reconcileProprBot, setSetting } from "@/features/bots/repository";
import { recordProprWsPositionEvent } from "@/features/propr/ws-position-cache";
import { getEnv } from "@/lib/env";

const PROPR_WORKER_HEARTBEAT_KEY = "propr_worker_heartbeat";
const PROPR_WORKER_WS_STATUS_KEY = "propr_worker_ws_status";
const PROPR_WORKER_STALE_MS = 30_000;
const PROPR_WS_RECONNECT_MS = 5_000;
const PROPR_WS_RECONCILE_DEBOUNCE_MS = 750;
const PROPR_WS_ACTIONABLE_EVENTS = new Set([
  "order.created",
  "order.updated",
  "order.cancelled",
  "order.triggered",
  "order.filled",
  "order.partially_filled",
  "position.opened",
  "position.closed",
  "position.liquidated",
  "position.take_profit.hit",
  "position.stop_loss.hit",
  "trade.created",
]);

export interface ProprReconciliationSummary {
  scanned: number;
  reconciled: number;
  syncedOrders: number;
  insertedFills: number;
  placedGridOrders: number;
  staleOpenOrders: number;
  safetyStops: number;
  stopLossStops: number;
  takeProfitStops: number;
  errors: Array<{ botId: string; message: string }>;
}

export interface ProprWorkerStatus {
  checkedAt: string;
  running: boolean;
  heartbeatAt?: string;
  heartbeatAgeMs?: number;
  lastTrigger?: "interval" | "propr_ws";
  lastSummary?: ProprReconciliationSummary;
  ws?: ProprWorkerWsStatus;
  lastSyncEvent?: {
    type: string;
    message: string;
    severity: string;
    createdAt: string;
  };
  recentErrors: Array<{
    type: string;
    message: string;
    createdAt: string;
  }>;
}

export interface ProprWorkerWsStatus {
  enabled: boolean;
  connected: boolean;
  url?: string;
  connectedAt?: string;
  disconnectedAt?: string;
  lastEventAt?: string;
  lastEventType?: string;
  reconnects: number;
  triggeredSyncs: number;
  lastError?: string;
  updatedAt: string;
}

export async function runProprReconciliation(options: { botId?: string } = {}): Promise<ProprReconciliationSummary> {
  const bots = listBots().filter(
    (bot) =>
      bot.config.mode === "propr_live" &&
      ["live", "running", "out_of_range"].includes(bot.status) &&
      (!options.botId || bot.id === options.botId),
  );
  const summary: ProprReconciliationSummary = {
    scanned: bots.length,
    reconciled: 0,
    syncedOrders: 0,
    insertedFills: 0,
    placedGridOrders: 0,
    staleOpenOrders: 0,
    safetyStops: 0,
    stopLossStops: 0,
    takeProfitStops: 0,
    errors: [],
  };

  for (const bot of bots) {
    try {
      const result = await reconcileProprBot(bot.id);
      summary.reconciled += 1;
      summary.syncedOrders += result.syncedOrders;
      summary.insertedFills += result.insertedFills;
      summary.placedGridOrders += result.placedGridOrders;
      summary.staleOpenOrders += result.staleOpenOrders ?? 0;
      if (result.safetyStopTriggered) summary.safetyStops += 1;
      if (result.exitTrigger === "stop_loss") summary.stopLossStops += 1;
      if (result.exitTrigger === "take_profit") summary.takeProfitStops += 1;
    } catch (error) {
      summary.errors.push({
        botId: bot.id,
        message: error instanceof Error ? error.message : "Unknown Propr reconciliation error",
      });
    }
  }

  return summary;
}

export function recordProprWorkerHeartbeat(
  summary: ProprReconciliationSummary,
  trigger: "interval" | "propr_ws" = "interval",
) {
  setSetting(
    PROPR_WORKER_HEARTBEAT_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
      trigger,
      summary,
    }),
  );
}

export function getProprWorkerStatus(): ProprWorkerStatus {
  const checkedAt = new Date();
  const heartbeat = readHeartbeat();
  const heartbeatAt = heartbeat?.at;
  const heartbeatAgeMs = heartbeatAt ? checkedAt.getTime() - Date.parse(heartbeatAt) : undefined;
  const events = listEvents(50);
  const lastSyncEvent = events.find((event) =>
    ["bot.propr_reconciled", "bot.propr_safety_stop", "bot.propr_emergency_stop", "bot.propr_start_failed"].includes(
      event.type,
    ),
  );
  const recentErrors = events
    .filter((event) => event.severity === "error" && event.type.includes("propr"))
    .slice(0, 5)
    .map((event) => ({
      type: event.type,
      message: event.message,
      createdAt: event.createdAt,
    }));

  return {
    checkedAt: checkedAt.toISOString(),
    running: heartbeatAgeMs !== undefined && heartbeatAgeMs <= PROPR_WORKER_STALE_MS,
    heartbeatAt,
    heartbeatAgeMs,
    lastTrigger: heartbeat?.trigger,
    lastSummary: heartbeat?.summary,
    ws: readWsStatus() ?? undefined,
    lastSyncEvent: lastSyncEvent
      ? {
          type: lastSyncEvent.type,
          message: lastSyncEvent.message,
          severity: lastSyncEvent.severity,
          createdAt: lastSyncEvent.createdAt,
        }
      : undefined,
    recentErrors,
  };
}

async function runLoop() {
  const intervalMs = Number(process.env.PROPR_WORKER_INTERVAL_MS ?? "10000");
  let syncInFlight: Promise<void> | null = null;
  let wsSyncTimer: NodeJS.Timeout | null = null;

  const runWorkerSync = async (trigger: "interval" | "propr_ws", eventType?: string) => {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      const summary = await runProprReconciliation();
      recordProprWorkerHeartbeat(summary, trigger);
      if (trigger === "propr_ws") {
        patchWsStatus((previous) => ({
          triggeredSyncs: previous.triggeredSyncs + 1,
          lastEventType: eventType ?? previous.lastEventType,
        }));
      }
      if (summary.scanned > 0 || summary.errors.length > 0) {
        console.log(JSON.stringify({ at: new Date().toISOString(), trigger, eventType, ...summary }));
      }
    })().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  };

  startProprWebSocketListener((eventType) => {
    if (wsSyncTimer) clearTimeout(wsSyncTimer);
    wsSyncTimer = setTimeout(() => {
      wsSyncTimer = null;
      void runWorkerSync("propr_ws", eventType);
    }, PROPR_WS_RECONCILE_DEBOUNCE_MS);
  });

  while (true) {
    await runWorkerSync("interval");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function startProprWebSocketListener(onActionableEvent: (eventType: string) => void) {
  const env = getEnv();
  if (!env.PROPR_API_KEY) {
    patchWsStatus(() => ({
      enabled: false,
      connected: false,
      url: env.PROPR_WS_URL,
      lastError: "PROPR_API_KEY is missing.",
    }));
    return;
  }

  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let socket: WebSocket | null = null;

  const connect = () => {
    if (stopped) return;
    patchWsStatus((previous) => ({
      enabled: true,
      connected: false,
      url: env.PROPR_WS_URL,
      reconnects: previous.connectedAt ? previous.reconnects + 1 : previous.reconnects,
      lastError: undefined,
    }));

    socket = new WebSocket(env.PROPR_WS_URL, {
      headers: { "X-API-Key": env.PROPR_API_KEY },
    });

    socket.on("open", () => {
      patchWsStatus(() => ({
        enabled: true,
        connected: true,
        url: env.PROPR_WS_URL,
        connectedAt: new Date().toISOString(),
        disconnectedAt: undefined,
        lastError: undefined,
      }));
    });

    socket.on("message", (raw) => {
      const now = new Date().toISOString();
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; data?: unknown; timestamp?: number };
        const eventType = message.type ?? "unknown";
        recordProprWsPositionEvent(eventType, message.data, now);
        patchWsStatus(() => ({
          enabled: true,
          connected: true,
          lastEventAt: now,
          lastEventType: eventType,
          lastError: undefined,
        }));
        if (PROPR_WS_ACTIONABLE_EVENTS.has(eventType)) {
          onActionableEvent(eventType);
        }
      } catch (error) {
        patchWsStatus(() => ({
          lastError: error instanceof Error ? error.message : "Invalid Propr WS message",
        }));
      }
    });

    socket.on("close", () => {
      socket = null;
      patchWsStatus(() => ({
        connected: false,
        disconnectedAt: new Date().toISOString(),
      }));
      if (!stopped) {
        reconnectTimer = setTimeout(connect, PROPR_WS_RECONNECT_MS);
      }
    });

    socket.on("error", (error) => {
      patchWsStatus(() => ({
        connected: false,
        lastError: error instanceof Error ? error.message : "Propr WS error",
      }));
    });
  };

  connect();

  process.once("SIGTERM", () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  });
}

function patchWsStatus(patch: (previous: ProprWorkerWsStatus) => Partial<ProprWorkerWsStatus>) {
  const previous =
    readWsStatus() ?? ({
      enabled: false,
      connected: false,
      reconnects: 0,
      triggeredSyncs: 0,
      updatedAt: new Date().toISOString(),
    } satisfies ProprWorkerWsStatus);
  const next = {
    ...previous,
    ...patch(previous),
    updatedAt: new Date().toISOString(),
  };
  setSetting(PROPR_WORKER_WS_STATUS_KEY, JSON.stringify(next));
}

function readWsStatus(): ProprWorkerWsStatus | null {
  const setting = getSetting(PROPR_WORKER_WS_STATUS_KEY);
  if (!setting) return null;

  try {
    const parsed = JSON.parse(setting.value) as Partial<ProprWorkerWsStatus>;
    if (typeof parsed.connected !== "boolean") return null;
    return {
      enabled: Boolean(parsed.enabled),
      connected: parsed.connected,
      url: typeof parsed.url === "string" ? parsed.url : undefined,
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : undefined,
      disconnectedAt: typeof parsed.disconnectedAt === "string" ? parsed.disconnectedAt : undefined,
      lastEventAt: typeof parsed.lastEventAt === "string" ? parsed.lastEventAt : undefined,
      lastEventType: typeof parsed.lastEventType === "string" ? parsed.lastEventType : undefined,
      reconnects: Number(parsed.reconnects ?? 0),
      triggeredSyncs: Number(parsed.triggeredSyncs ?? 0),
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : setting.updatedAt,
    };
  } catch {
    return null;
  }
}

function readHeartbeat(): { at: string; trigger?: "interval" | "propr_ws"; summary?: ProprReconciliationSummary } | null {
  const setting = getSetting(PROPR_WORKER_HEARTBEAT_KEY);
  if (!setting) return null;

  try {
    const parsed = JSON.parse(setting.value) as {
      at?: unknown;
      trigger?: unknown;
      summary?: ProprReconciliationSummary;
    };
    return typeof parsed.at === "string"
      ? {
          at: parsed.at,
          trigger: parsed.trigger === "propr_ws" ? "propr_ws" : "interval",
          summary: parsed.summary,
        }
      : null;
  } catch {
    return null;
  }
}
