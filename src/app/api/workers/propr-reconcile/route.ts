import { NextResponse } from "next/server";

import { runProprReconciliation } from "@/server/workers/propr-reconciliation-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const botId = await readBotId(request);
  const summary = await runProprReconciliation({ botId });
  return NextResponse.json({ data: summary });
}

async function readBotId(request: Request): Promise<string | undefined> {
  try {
    const body = (await request.json()) as { botId?: unknown };
    return typeof body.botId === "string" && body.botId.length > 0 ? body.botId : undefined;
  } catch {
    return undefined;
  }
}
