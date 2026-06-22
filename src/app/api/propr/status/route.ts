import { NextResponse } from "next/server";

import { checkProprLiveReadiness } from "@/features/propr/readiness";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json(await checkProprLiveReadiness(user));
}
