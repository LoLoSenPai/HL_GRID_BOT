import { NextResponse } from "next/server";

import type { GridConfig } from "@/domain/types";
import { createAndStartPaperBot, createLiveCandidate, listBots } from "@/features/bots/repository";

export async function GET() {
  return NextResponse.json({ data: listBots() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; config?: GridConfig };
  if (!body.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  try {
    const bot =
      body.config.mode === "propr_live"
        ? createLiveCandidate(body.name ?? `${body.config.pair} Propr Live Candidate`, body.config)
        : await createAndStartPaperBot(body.name ?? `${body.config.pair} Paper Grid`, body.config);
    return NextResponse.json({ data: bot }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create bot" },
      { status: 400 },
    );
  }
}
