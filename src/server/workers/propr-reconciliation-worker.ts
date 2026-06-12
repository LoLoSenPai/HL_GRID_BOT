import { pathToFileURL } from "node:url";

import { getSetting, listBots, listEvents, reconcileProprBot, setSetting } from "@/features/bots/repository";

const PROPR_WORKER_HEARTBEAT_KEY = "propr_worker_heartbeat";
const PROPR_WORKER_STALE_MS = 30_000;

export interface ProprReconciliationSummary {
  scanned: number;
  reconciled: number;
  safetyStops: number;
  errors: Array<{ botId: string; message: string }>;
}

export interface ProprWorkerStatus {
  checkedAt: string;
  running: boolean;
  heartbeatAt?: string;
  heartbeatAgeMs?: number;
  lastSummary?: ProprReconciliationSummary;
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
    safetyStops: 0,
    errors: [],
  };

  for (const bot of bots) {
    try {
      const result = await reconcileProprBot(bot.id);
      summary.reconciled += 1;
      if (result.safetyStopTriggered) summary.safetyStops += 1;
    } catch (error) {
      summary.errors.push({
        botId: bot.id,
        message: error instanceof Error ? error.message : "Unknown Propr reconciliation error",
      });
    }
  }

  return summary;
}

export function recordProprWorkerHeartbeat(summary: ProprReconciliationSummary) {
  setSetting(
    PROPR_WORKER_HEARTBEAT_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
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
    lastSummary: heartbeat?.summary,
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
  while (true) {
    const summary = await runProprReconciliation();
    recordProprWorkerHeartbeat(summary);
    if (summary.scanned > 0 || summary.errors.length > 0) {
      console.log(JSON.stringify({ at: new Date().toISOString(), ...summary }));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function readHeartbeat(): { at: string; summary?: ProprReconciliationSummary } | null {
  const setting = getSetting(PROPR_WORKER_HEARTBEAT_KEY);
  if (!setting) return null;

  try {
    const parsed = JSON.parse(setting.value) as { at?: unknown; summary?: ProprReconciliationSummary };
    return typeof parsed.at === "string" ? { at: parsed.at, summary: parsed.summary } : null;
  } catch {
    return null;
  }
}
