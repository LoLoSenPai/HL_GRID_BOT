import { NextResponse } from "next/server";

import type { ExecutionPosition } from "@/features/execution/types";
import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";
import { getBotPerformanceRows } from "@/features/bots/performance";
import { getRuntimeMetrics, listBots } from "@/features/bots/repository";
import { getMarketSnapshots } from "@/features/market-data/service";
import { getProprChallengeSummary } from "@/features/propr/challenge-summary";
import { mergeProprWsPositionSnapshots } from "@/features/propr/ws-position-cache";
import type { Bot } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = getRuntimeMetrics();
  const bots = listBots().filter(isTerminalActiveBot);

  const [markets, challenge, livePositions] = await Promise.all([
    getMarketSnapshots(),
    getProprChallengeSummary(metrics),
    loadLivePositions(),
  ]);

  return NextResponse.json({
    data: {
      checkedAt: new Date().toISOString(),
      markets,
      challenge,
      bots: getBotPerformanceRows(bots),
      livePositions,
    },
  });
}

function isTerminalActiveBot(bot: Bot): boolean {
  return ["paper", "running", "live", "out_of_range", "paused"].includes(bot.status);
}

async function loadLivePositions(): Promise<ExecutionPosition[]> {
  try {
    const adapter = new ProprExecutionAdapter();
    const health = await adapter.health();
    if (!health.ok) return [];
    return mergeProprWsPositionSnapshots(await adapter.getPositions());
  } catch {
    return [];
  }
}
