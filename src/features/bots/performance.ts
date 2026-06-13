import { decimal, toDecimalString } from "@/domain/decimal";
import type { Bot } from "@/domain/types";
import { getBotRuntimeState, listFills, listOrders } from "@/features/bots/repository";

export interface BotPerformanceSummary {
  bot: Bot;
  openOrders: number;
  filledOrders: number;
  fillCount: number;
  volume: string;
  realizedPnl: string;
  fees: string;
  trackedPnl: string;
  trackedPnlPct: string;
  exposure: string;
  lastPrice?: string;
  lastFillAt?: string;
  stateLabel: string;
}

export function getBotPerformance(bot: Bot): BotPerformanceSummary {
  const orders = listOrders(bot.id);
  const fills = listFills(bot.id);
  const runtime = getBotRuntimeState(bot.id);
  const realizedPnl = fills.reduce((sum, fill) => sum.plus(fill.realizedPnl), decimal(0));
  const fees = fills.reduce((sum, fill) => sum.plus(fill.fee), decimal(0));
  const volume = fills.reduce((sum, fill) => sum.plus(decimal(fill.quantity).mul(fill.price)), decimal(0));
  const trackedPnl = runtime?.pnl ? decimal(runtime.pnl) : realizedPnl;
  const capital = decimal(bot.config.capitalAllocation || "0");
  const trackedPnlPct = capital.gt(0) ? trackedPnl.div(capital).mul(100) : decimal(0);
  const openOrders = orders.filter((order) => order.status === "open").length;
  const filledOrders = orders.filter((order) => order.status === "filled").length;
  const lastFillAt = fills
    .map((fill) => fill.executedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    bot,
    openOrders,
    filledOrders,
    fillCount: fills.length,
    volume: toDecimalString(volume, 2),
    realizedPnl: toDecimalString(realizedPnl, 2),
    fees: toDecimalString(fees, 4),
    trackedPnl: toDecimalString(trackedPnl, 2),
    trackedPnlPct: toDecimalString(trackedPnlPct, 2),
    exposure: runtime?.exposure ?? "0",
    lastPrice: runtime?.lastPrice,
    lastFillAt,
    stateLabel: deriveStateLabel(bot, openOrders, filledOrders, fills.length),
  };
}

export function getBotPerformanceRows(bots: Bot[]): BotPerformanceSummary[] {
  return bots.map(getBotPerformance);
}

function deriveStateLabel(bot: Bot, openOrders: number, filledOrders: number, fillCount: number) {
  if (["stopped", "paused", "error", "out_of_range"].includes(bot.status)) return bot.status.replaceAll("_", " ");
  if (fillCount > 0 && openOrders > 0) return "in market";
  if (filledOrders > 0) return "filled";
  if (openOrders > 0) return "waiting fill";
  return "draft";
}
