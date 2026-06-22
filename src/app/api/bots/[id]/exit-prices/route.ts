import { NextResponse } from "next/server";

import { updateBotExitPrices } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as { takeProfit?: unknown; stopLoss?: unknown };

  try {
    const bot = updateBotExitPrices(
      id,
      {
        takeProfit: typeof body.takeProfit === "string" ? body.takeProfit : null,
        stopLoss: typeof body.stopLoss === "string" ? body.stopLoss : null,
      },
      user,
    );
    return NextResponse.json({ ok: true, data: bot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update bot exit levels" },
      { status: 400 },
    );
  }
}
