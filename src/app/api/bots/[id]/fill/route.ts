import { NextResponse } from "next/server";

import { simulateNextPaperFill } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  try {
    simulateNextPaperFill(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to simulate fill" },
      { status: 400 },
    );
  }
}
