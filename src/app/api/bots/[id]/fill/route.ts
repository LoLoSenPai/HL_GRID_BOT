import { NextResponse } from "next/server";

import { simulateNextPaperFill } from "@/features/bots/repository";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    simulateNextPaperFill(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to simulate fill" },
      { status: 400 },
    );
  }
}
