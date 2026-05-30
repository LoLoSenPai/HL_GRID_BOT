import { NextResponse } from "next/server";

import { getMarketSnapshotFeed } from "@/features/market-data/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await getMarketSnapshotFeed();
  return NextResponse.json(feed);
}
