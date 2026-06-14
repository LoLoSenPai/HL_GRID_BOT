import { NextResponse } from "next/server";

import { updateBotExitPrices } from "@/features/bots/repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { takeProfit?: unknown; stopLoss?: unknown };

  try {
    const bot = updateBotExitPrices(id, {
      takeProfit: typeof body.takeProfit === "string" ? body.takeProfit : null,
      stopLoss: typeof body.stopLoss === "string" ? body.stopLoss : null,
    });
    return NextResponse.json({ ok: true, data: bot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update bot exit levels" },
      { status: 400 },
    );
  }
}
