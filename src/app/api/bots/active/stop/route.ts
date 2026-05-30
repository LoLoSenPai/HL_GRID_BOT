import { NextResponse } from "next/server";

import { listBots, stopBot } from "@/features/bots/repository";

export async function POST() {
  const active = listBots().find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status));
  if (!active) return NextResponse.json({ error: "No active bot to stop" }, { status: 404 });

  stopBot(active.id);
  return NextResponse.json({ ok: true, id: active.id });
}
