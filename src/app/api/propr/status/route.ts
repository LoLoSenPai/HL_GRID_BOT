import { NextResponse } from "next/server";

import { checkProprLiveReadiness } from "@/features/propr/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await checkProprLiveReadiness());
}
