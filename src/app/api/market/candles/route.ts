import { NextResponse } from "next/server";

import { deriveDefaultGridConfigFromPrice } from "@/domain/grid-defaults";
import { isSupportedMarket } from "@/domain/markets";
import type { MarketSymbol } from "@/domain/types";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { getCandlesForConfig, getMarketSnapshots } from "@/features/market-data/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");

  if (!asset || !isSupportedMarket(asset)) {
    return NextResponse.json({ error: "Unsupported market asset" }, { status: 400 });
  }

  try {
    const [market] = await getMarketSnapshots([asset]);
    const config = deriveDefaultGridConfigFromPrice(
      { ...defaultBotConfig, pair: asset as MarketSymbol },
      market?.mid,
    );
    const candles = await getCandlesForConfig(config);

    return NextResponse.json({ data: candles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load candles" },
      { status: 500 },
    );
  }
}
