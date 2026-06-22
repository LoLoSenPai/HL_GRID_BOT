import { NextResponse } from "next/server";

import { closeBot, getBot, listBots } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const requestedId = await readRequestedBotId(request);
  const active = requestedId
    ? getBot(requestedId, user)
    : listBots(user).find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status));
  if (!active) return NextResponse.json({ error: "No active bot to close" }, { status: 404 });

  try {
    const summary = await closeBot(active.id, "Manual close from terminal", user);
    return NextResponse.json({ ok: true, id: active.id, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to close bot" },
      { status: 400 },
    );
  }
}

async function readRequestedBotId(request: Request): Promise<string | undefined> {
  try {
    const payload = (await request.json()) as { id?: unknown };
    return typeof payload.id === "string" && payload.id.length > 0 ? payload.id : undefined;
  } catch {
    return undefined;
  }
}
