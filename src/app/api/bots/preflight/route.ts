import { NextResponse } from "next/server";

import type { GridConfig } from "@/domain/types";
import { getChallengeRiskPreflightForConfig } from "@/features/bots/repository";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = (await request.json()) as { config?: GridConfig; botId?: string };
  if (!body.config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  try {
    const preflight = await getChallengeRiskPreflightForConfig(body.config, body.botId ?? "", user);
    return NextResponse.json({ data: preflight });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate challenge risk preflight" },
      { status: 400 },
    );
  }
}
