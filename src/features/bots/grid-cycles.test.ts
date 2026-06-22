import { describe, expect, it } from "vitest";

import type { Bot } from "@/domain/types";
import { buildGridCycleReport } from "@/features/bots/grid-cycles";
import type { PersistedFill, PersistedOrder } from "@/features/bots/repository";

const baseBot: Bot = {
  id: "bot_test",
  name: "Test Grid",
  status: "live",
  ownerUser: "loic",
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  config: {
    pair: "BTC",
    positionSide: "short",
    lowerPrice: "100",
    upperPrice: "104",
    gridCount: 5,
    capitalAllocation: "1000",
    leverage: 2,
    spacing: "arithmetic",
    orderSize: "0",
    takeProfit: "99",
    stopLoss: "105",
    maxDrawdownPct: "8",
    challengeDailyLossStopPct: "2.75",
    autoPauseOutOfRange: true,
    autoRecenter: false,
    mode: "propr_live",
  },
};

describe("buildGridCycleReport", () => {
  it("pairs a short entry sell with the lower reduce-only buy", () => {
    const orders: PersistedOrder[] = [
      order("entry", "sell", "BTC-3-103", false, "103"),
      order("exit", "buy", "BTC-2-102", true, "102"),
    ];
    const fills: PersistedFill[] = [
      fill("fill_entry", "entry", "sell", "1", "103", "0.1", "0", "2026-06-14T00:00:00.000Z"),
      fill("fill_exit", "exit", "buy", "1", "102", "0.1", "0", "2026-06-14T00:01:00.000Z"),
    ];

    const report = buildGridCycleReport(baseBot, orders, fills);

    expect(report.summary.closedCycles).toBe(1);
    expect(report.summary.closedGrossPnl).toBe("1");
    expect(report.summary.closedFees).toBe("0.2");
    expect(report.summary.closedNetPnl).toBe("0.8");
    expect(report.rows[0]).toMatchObject({
      status: "closed",
      band: "2-3",
      entryPrice: "103",
      exitPrice: "102",
      netPnl: "0.8",
    });
  });

  it("keeps unclosed entry fills as open cycles", () => {
    const orders: PersistedOrder[] = [order("entry", "sell", "BTC-4-104", false, "104")];
    const fills: PersistedFill[] = [
      fill("fill_entry", "entry", "sell", "1", "104", "0.1", "0", "2026-06-14T00:00:00.000Z"),
    ];

    const report = buildGridCycleReport(baseBot, orders, fills);

    expect(report.summary.closedCycles).toBe(0);
    expect(report.summary.openCycles).toBe(1);
    expect(report.rows[0]).toMatchObject({
      status: "open",
      band: "3-4",
      entryPrice: "104",
      targetExitPrice: "103",
      netPnl: "-0.1",
    });
  });
});

function order(
  id: string,
  side: "buy" | "sell",
  gridLevelId: string,
  reduceOnly: boolean,
  price: string,
): PersistedOrder {
  return {
    id,
    bot_id: baseBot.id,
    grid_level_id: gridLevelId,
    provider_order_id: id,
    intent_id: id,
    asset: "BTC",
    side,
    position_side: "short",
    type: "limit",
    status: "filled",
    quantity: "1",
    price,
    reduce_only: reduceOnly ? 1 : 0,
    cumulative_quantity: "1",
    average_fill_price: price,
    created_at: "2026-06-14T00:00:00.000Z",
    updated_at: "2026-06-14T00:00:00.000Z",
  };
}

function fill(
  id: string,
  orderId: string,
  side: "buy" | "sell",
  quantity: string,
  price: string,
  fee: string,
  realizedPnl: string,
  executedAt: string,
): PersistedFill {
  return {
    id,
    botId: baseBot.id,
    orderId,
    asset: "BTC",
    side,
    quantity,
    price,
    fee,
    realizedPnl,
    executedAt,
  };
}
