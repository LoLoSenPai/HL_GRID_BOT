import { NextResponse } from "next/server";

import { getProprWorkerStatus } from "@/server/workers/propr-reconciliation-worker";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: getProprWorkerStatus() });
}
