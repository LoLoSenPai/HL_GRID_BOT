import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { getSqlite } from "@/db/client";
import { resetDatabaseInitializationForTests } from "@/db/init";
import {
  createBot,
  createAndStartPaperBot,
  createLiveCandidate,
  createLiveCandidateFromBot,
  getBot,
  getBotRuntimeState,
  getRuntimeMetrics,
  listBots,
  listEvents,
  reconcilePaperRuntime,
  simulateNextPaperFill,
  startPaperBot,
} from "@/features/bots/repository";
import { defaultBotConfig } from "@/features/bots/sample-data";

const dbPath = "./data/test_hl_grid_bot.sqlite";

beforeEach(() => {
  closeDb();
  resetDatabaseInitializationForTests();
  process.env.DATABASE_URL = `file:${dbPath}`;
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  if (fs.existsSync(`${dbPath}-wal`)) fs.rmSync(`${dbPath}-wal`);
  if (fs.existsSync(`${dbPath}-shm`)) fs.rmSync(`${dbPath}-shm`);
});

describe("bot repository", () => {
  it("bootstraps starter bots into SQLite", () => {
    expect(listBots()).toHaveLength(3);
    expect(listEvents(10).some((event) => event.type === "system.seeded")).toBe(true);
  });

  it("creates, starts and fills a paper bot", async () => {
    const bot = createBot("Repository Paper Grid", defaultBotConfig);
    await startPaperBot(bot.id);
    simulateNextPaperFill(bot.id);

    const metrics = getRuntimeMetrics();
    expect(metrics.openOrders).toBeGreaterThan(0);
    expect(metrics.fills).toBe(1);
    expect(Number(metrics.volume)).toBeGreaterThan(0);
  });

  it("reconciles runtime state from persisted paper orders", async () => {
    const bot = createBot("Repository Reconcile Grid", defaultBotConfig);
    await startPaperBot(bot.id);

    const summary = reconcilePaperRuntime({
      botId: bot.id,
      markPrices: { BTC: "100000" },
      emitEvents: false,
    });
    const runtimeState = getBotRuntimeState(bot.id);

    expect(summary.reconciled).toBe(1);
    expect(runtimeState?.lastPrice).toBe("100000");
    expect(Number(runtimeState?.exposure)).toBeGreaterThan(0);
    expect(getBot(bot.id)?.status).toBe("paper");
  });

  it("pauses active paper bots when reconciliation finds no open orders", async () => {
    const bot = createBot("Repository Missing Orders Grid", defaultBotConfig);
    await startPaperBot(bot.id);
    getSqlite().prepare("DELETE FROM orders WHERE bot_id = ?").run(bot.id);

    const summary = reconcilePaperRuntime({
      botId: bot.id,
      markPrices: { BTC: "100000" },
      emitEvents: false,
    });

    expect(summary.paused).toBe(1);
    expect(getBot(bot.id)?.status).toBe("paused");
  });

  it("does not start Propr Live from the paper runtime", async () => {
    await expect(
      createAndStartPaperBot("Repository Live Grid", {
        ...defaultBotConfig,
        mode: "propr_live",
      }),
    ).rejects.toThrow("Propr Live cannot be started by the paper runtime.");
  });

  it("creates a separate Propr Live candidate from a paper bot", async () => {
    const paperBot = createBot("Repository Promotion Grid", defaultBotConfig);

    const liveCandidate = createLiveCandidateFromBot(paperBot.id);

    expect(liveCandidate.id).not.toBe(paperBot.id);
    expect(liveCandidate.name).toBe("Repository Promotion Grid Live Candidate");
    expect(liveCandidate.status).toBe("draft");
    expect(liveCandidate.config.mode).toBe("propr_live");
    expect(liveCandidate.config.autoPauseOutOfRange).toBe(true);
  });

  it("creates a draft Propr Live candidate directly from config", () => {
    const liveCandidate = createLiveCandidate("Repository Direct Live Candidate", {
      ...defaultBotConfig,
      mode: "propr_live",
      autoPauseOutOfRange: false,
      autoRecenter: true,
    });

    expect(liveCandidate.status).toBe("draft");
    expect(liveCandidate.config.mode).toBe("propr_live");
    expect(liveCandidate.config.autoPauseOutOfRange).toBe(true);
    expect(liveCandidate.config.autoRecenter).toBe(false);
    expect(listEvents(10, liveCandidate.id).some((event) => event.type === "bot.live_candidate_created")).toBe(true);
  });
});
