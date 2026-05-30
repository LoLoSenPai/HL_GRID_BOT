import { NextResponse } from "next/server";

import { startPaperBot } from "@/features/bots/repository";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await startPaperBot(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start bot" },
      { status: 400 },
    );
  }
}
