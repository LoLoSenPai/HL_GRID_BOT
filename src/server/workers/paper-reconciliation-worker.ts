import type { MarketSymbol } from "@/domain/types";
import {
  reconcilePaperRuntime,
  type PaperReconciliationSummary,
} from "@/features/bots/repository";
import { getMarketSnapshots } from "@/features/market-data/service";

export interface PaperReconciliationWorkerOptions {
  botId?: string;
  emitEvents?: boolean;
  markPrices?: Partial<Record<MarketSymbol, string>>;
}

export async function runPaperReconciliation(
  options: PaperReconciliationWorkerOptions = {},
): Promise<PaperReconciliationSummary> {
  const markPrices = options.markPrices ?? (await getLiveMarkPrices());

  return reconcilePaperRuntime({
    botId: options.botId,
    emitEvents: options.emitEvents,
    markPrices,
  });
}

async function getLiveMarkPrices(): Promise<Partial<Record<MarketSymbol, string>>> {
  const markets = await getMarketSnapshots();
  const markPrices: Partial<Record<MarketSymbol, string>> = {};
  for (const market of markets) {
    markPrices[market.asset] = market.mid;
  }

  return markPrices;
}
