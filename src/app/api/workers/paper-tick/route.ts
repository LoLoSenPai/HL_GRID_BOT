import { NextResponse } from "next/server";

import { runPaperRuntimeTick } from "@/server/workers/paper-runtime-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = await readLimit(request);
  const summary = await runPaperRuntimeTick({ limit });
  return NextResponse.json({ data: summary });
}

async function readLimit(request: Request): Promise<number> {
  try {
    const body = (await request.json()) as { limit?: unknown };
    return typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 1;
  } catch {
    return 1;
  }
}
