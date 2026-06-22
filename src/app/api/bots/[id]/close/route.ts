import { NextResponse } from "next/server";

import { closeBot } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  try {
    const summary = await closeBot(id, "Manual close from bot action", user);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to close bot" },
      { status: 400 },
    );
  }
}
