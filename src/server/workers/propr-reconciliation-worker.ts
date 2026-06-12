import { pathToFileURL } from "node:url";

import { listBots, reconcileProprBot } from "@/features/bots/repository";

export interface ProprReconciliationSummary {
  scanned: number;
  reconciled: number;
  safetyStops: number;
  errors: Array<{ botId: string; message: string }>;
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

async function runLoop() {
  const intervalMs = Number(process.env.PROPR_WORKER_INTERVAL_MS ?? "10000");
  while (true) {
    const summary = await runProprReconciliation();
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
