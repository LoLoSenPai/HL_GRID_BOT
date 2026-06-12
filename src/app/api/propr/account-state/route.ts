import { NextResponse } from "next/server";

import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adapter = new ProprExecutionAdapter();
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
