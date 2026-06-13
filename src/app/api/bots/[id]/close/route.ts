import { NextResponse } from "next/server";

import { closeBot } from "@/features/bots/repository";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const summary = await closeBot(id, "Manual close from bot action");
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to close bot" },
      { status: 400 },
    );
  }
}
