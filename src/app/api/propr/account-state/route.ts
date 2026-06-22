import { NextResponse } from "next/server";

import { createProprExecutionAdapter } from "@/features/execution/propr-adapter";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const adapter = createProprExecutionAdapter(user);
    const health = await adapter.health();

    if (!health.ok) {
      return NextResponse.json({
        data: {
          ok: false,
          checkedAt: new Date().toISOString(),
          reason: health.reason ?? "Propr adapter is not healthy.",
          openOrders: [],
          positions: [],
          trades: [],
        },
      });
    }

    const [openOrders, positions, trades] = await Promise.all([
      adapter.getOpenOrders(),
      adapter.getPositions(),
      adapter.getTrades(),
    ]);

    return NextResponse.json({
      data: {
        ok: true,
        checkedAt: new Date().toISOString(),
        openOrders: openOrders.slice(0, 25),
        positions: positions.slice(0, 25),
        trades: trades.slice(0, 25),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: {
          ok: false,
          checkedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : "Unable to load Propr account state",
          openOrders: [],
          positions: [],
          trades: [],
        },
      },
      { status: 200 },
    );
  }
}
