import { NextResponse } from "next/server";

import { formatMarketSymbol } from "@/domain/markets";
import type { GridConfig } from "@/domain/types";
import { createAndStartPaperBot, createAndStartProprBot, createLiveCandidate, listBots } from "@/features/bots/repository";

export async function GET() {
  return NextResponse.json({ data: listBots() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; config?: GridConfig; confirmProprChallengeStart?: boolean };
  if (!body.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  try {
    const bot =
      body.config.mode === "propr_live"
        ? body.confirmProprChallengeStart
          ? await createAndStartProprBot(body.name ?? `${formatMarketSymbol(body.config.pair)} Challenge Grid`, body.config)
          : createLiveCandidate(body.name ?? `${formatMarketSymbol(body.config.pair)} Challenge Candidate`, body.config)
        : await createAndStartPaperBot(body.name ?? `${formatMarketSymbol(body.config.pair)} Local Sim Grid`, body.config);
    return NextResponse.json({ data: bot }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 400 },
    );
  }
}
