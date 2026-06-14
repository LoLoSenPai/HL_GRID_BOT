import { NextResponse } from "next/server";

import { buildGridCycleReport } from "@/features/bots/grid-cycles";
import { getBot, listFills, listOrders } from "@/features/bots/repository";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bot = getBot(id);
  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: buildGridCycleReport(bot, listOrders(bot.id), listFills(bot.id)),
  });
}
