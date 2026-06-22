import { NextResponse } from "next/server";

import type { ExecutionPosition } from "@/features/execution/types";
import { createProprExecutionAdapter } from "@/features/execution/propr-adapter";
import { getBotPerformanceRows } from "@/features/bots/performance";
import { getRuntimeMetrics, listBots, listFills, listOrders } from "@/features/bots/repository";
import { getMarketSnapshots } from "@/features/market-data/service";
import { getProprChallengeSummary } from "@/features/propr/challenge-summary";
import { mergeProprWsPositionSnapshots } from "@/features/propr/ws-position-cache";
import type { Bot, MarketSymbol } from "@/domain/types";
import type { TerminalLiveFill, TerminalLiveOrder } from "@/components/trading/terminal-live-types";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const metrics = getRuntimeMetrics(user);
  const bots = listBots(user).filter(isTerminalActiveBot);
  const marketAssets = activeMarketAssets(bots);

  const [markets, challenge, livePositions] = await Promise.all([
    getMarketSnapshots(marketAssets),
    getProprChallengeSummary(metrics, user),
    loadLivePositions(user),
  ]);

  return NextResponse.json({
    data: {
      checkedAt: new Date().toISOString(),
      markets,
      challenge,
      bots: getBotPerformanceRows(bots),
      livePositions,
      orders: getTerminalLiveOrders(bots),
      fills: getTerminalLiveFills(bots),
    },
  });
}

function isTerminalActiveBot(bot: Bot): boolean {
  return ["paper", "running", "live", "out_of_range", "paused"].includes(bot.status);
}

function activeMarketAssets(bots: Bot[]): MarketSymbol[] {
  const assets = new Set<MarketSymbol>();
  for (const bot of bots) assets.add(bot.config.pair);
  return assets.size ? Array.from(assets) : ["BTC"];
}

async function loadLivePositions(ownerUser: string): Promise<ExecutionPosition[]> {
  try {
    const adapter = createProprExecutionAdapter(ownerUser);
    const health = await adapter.health();
    if (!health.ok) return [];
    return mergeProprWsPositionSnapshots(await adapter.getPositions(), ownerUser);
  } catch {
    return [];
  }
}

function getTerminalLiveOrders(bots: Bot[]): TerminalLiveOrder[] {
  return bots.flatMap((bot) =>
    listOrders(bot.id)
      .filter((order) => ["pending", "open", "partially_filled"].includes(order.status))
      .slice(0, 140)
      .map((order) => ({
        id: order.id,
        botId: bot.id,
        asset: order.asset,
        side: order.side,
        status: order.status,
        quantity: order.quantity,
        price: order.price,
        reduceOnly: Boolean(order.reduce_only),
      })),
  );
}

function getTerminalLiveFills(bots: Bot[]): TerminalLiveFill[] {
  return bots.flatMap((bot) =>
    listFills(bot.id)
      .slice(0, 120)
      .map((fill) => ({
        id: fill.id,
        botId: bot.id,
        asset: fill.asset,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.fee,
        realizedPnl: fill.realizedPnl,
        executedAt: fill.executedAt,
      })),
  );
}
