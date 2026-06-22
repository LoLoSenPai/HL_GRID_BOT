import { NextResponse } from "next/server";

import { triggerProprEmergencyStop } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let reason = "Manual kill switch";

  try {
    const body = (await request.json().catch(() => null)) as { reason?: string } | null;
    if (body?.reason) reason = body.reason;
  } catch {
    reason = "Manual kill switch";
  }

  try {
    const summary = await triggerProprEmergencyStop(reason, user);
    return NextResponse.json({ data: summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Propr emergency stop failed" },
      { status: 500 },
    );
  }
}
