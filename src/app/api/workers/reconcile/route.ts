import { NextResponse } from "next/server";

import { runPaperReconciliation } from "@/server/workers/paper-reconciliation-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const botId = await readBotId(request);
  const summary = await runPaperReconciliation({ botId });
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
