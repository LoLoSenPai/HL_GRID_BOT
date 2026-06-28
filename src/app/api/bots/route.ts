import { NextResponse } from "next/server";

import { formatMarketSymbol } from "@/domain/markets";
import type { GridConfig } from "@/domain/types";
import { createAndQueueProprBot, createAndStartPaperBot, createLiveCandidate, listBots } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ data: listBots(user) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = (await request.json()) as { name?: string; config?: GridConfig; confirmProprChallengeStart?: boolean };
  if (!body.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  try {
    const bot =
      body.config.mode === "propr_live"
        ? body.confirmProprChallengeStart
          ? await createAndQueueProprBot(body.name ?? `${formatMarketSymbol(body.config.pair)} Challenge Grid`, body.config, user)
          : createLiveCandidate(body.name ?? `${formatMarketSymbol(body.config.pair)} Challenge Candidate`, body.config, undefined, user)
        : await createAndStartPaperBot(body.name ?? `${formatMarketSymbol(body.config.pair)} Local Sim Grid`, body.config, user);
    return NextResponse.json({ data: bot }, { status: body.config.mode === "propr_live" && body.confirmProprChallengeStart ? 202 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 400 },
    );
  }
}
