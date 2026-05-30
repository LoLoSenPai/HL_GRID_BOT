import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { closeDb } from "@/db/client";
import { resetDatabaseInitializationForTests } from "@/db/init";
import { createBot, getRuntimeMetrics, startPaperBot } from "@/features/bots/repository";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { runPaperRuntimeTick } from "@/server/workers/paper-runtime-worker";

const dbPath = "./data/test_hl_grid_bot_worker.sqlite";

beforeEach(() => {
  closeDb();
  resetDatabaseInitializationForTests();
  process.env.DATABASE_URL = `file:${dbPath}`;
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  if (fs.existsSync(`${dbPath}-wal`)) fs.rmSync(`${dbPath}-wal`);
  if (fs.existsSync(`${dbPath}-shm`)) fs.rmSync(`${dbPath}-shm`);
});

describe("paper runtime worker", () => {
  it("fills one open paper order per default tick", async () => {
    const bot = createBot("Worker Paper Grid", defaultBotConfig);
    await startPaperBot(bot.id);

    const before = getRuntimeMetrics();
    const summary = await runPaperRuntimeTick({ markPrices: { BTC: "100000" } });
    const after = getRuntimeMetrics();

    expect(summary.reconciled).toBeGreaterThanOrEqual(1);
    expect(summary.filled).toBe(1);
    expect(after.fills).toBe(before.fills + 1);
  });
});
