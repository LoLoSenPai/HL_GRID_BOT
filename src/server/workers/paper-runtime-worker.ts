import type { MarketSymbol } from "@/domain/types";
import { listBots, listOrders, simulateNextPaperFill } from "@/features/bots/repository";
import { logger } from "@/lib/logger";
import { runPaperReconciliation } from "@/server/workers/paper-reconciliation-worker";

export interface PaperRuntimeTickOptions {
  limit?: number;
  markPrices?: Partial<Record<MarketSymbol, string>>;
}

export interface PaperRuntimeTickSummary {
  scanned: number;
  reconciled: number;
  filled: number;
  skipped: number;
  errors: Array<{ botId: string; message: string }>;
}

const PAPER_RUNTIME_STATUSES = new Set(["paper", "running"]);

export async function runPaperRuntimeTick(options: PaperRuntimeTickOptions = {}): Promise<PaperRuntimeTickSummary> {
  const limit = Math.max(1, Math.min(options.limit ?? 1, 10));
  const reconciliation = await runPaperReconciliation({
    emitEvents: false,
    markPrices: options.markPrices,
  });
  const bots = listBots().filter((bot) => PAPER_RUNTIME_STATUSES.has(bot.status));
  const summary: PaperRuntimeTickSummary = {
    scanned: bots.length,
    reconciled: reconciliation.reconciled,
    filled: 0,
    skipped: 0,
    errors: [...reconciliation.errors],
  };

  for (const bot of bots) {
    if (summary.filled >= limit) break;

    const hasOpenOrders = listOrders(bot.id).some((order) => order.status === "open");
    if (!hasOpenOrders) {
      summary.skipped += 1;
      continue;
    }

    try {
      simulateNextPaperFill(bot.id);
      summary.filled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Paper tick failed";
      summary.errors.push({ botId: bot.id, message });
      logger.warn("paper_runtime.tick_failed", { botId: bot.id, error: message });
    }
  }

  return summary;
}
