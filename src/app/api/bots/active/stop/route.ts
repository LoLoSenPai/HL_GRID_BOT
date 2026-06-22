import { NextResponse } from "next/server";

import { getBot, listBots, stopBot } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const requestedId = await readRequestedBotId(request);
  const active = requestedId
    ? getBot(requestedId, user)
    : listBots(user).find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status));
  if (!active) return NextResponse.json({ error: "No active bot to stop" }, { status: 404 });

  await stopBot(active.id, user);
  return NextResponse.json({ ok: true, id: active.id });
}

async function readRequestedBotId(request: Request): Promise<string | undefined> {
  try {
    const payload = (await request.json()) as { id?: unknown };
    return typeof payload.id === "string" && payload.id.length > 0 ? payload.id : undefined;
  } catch {
    return undefined;
  }
}
