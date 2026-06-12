import { NextResponse } from "next/server";

import { triggerProprEmergencyStop } from "@/features/bots/repository";

export async function POST(request: Request) {
  let reason = "Manual kill switch";

  try {
    const body = (await request.json().catch(() => null)) as { reason?: string } | null;
    if (body?.reason) reason = body.reason;
  } catch {
    reason = "Manual kill switch";
  }

  try {
    const summary = await triggerProprEmergencyStop(reason);
    return NextResponse.json({ data: summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Propr emergency stop failed" },
      { status: 500 },
    );
  }
}
