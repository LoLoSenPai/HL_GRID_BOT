import { ulid } from "ulid";

import { decimal, toDecimalString } from "@/domain/decimal";
import { generateGridLevels, isOutOfRange, reduceOnlyForGridSide } from "@/domain/grid";
import type { GridConfig, GridLevel, RuntimeMetrics } from "@/domain/types";
import type { ExecutionOrder } from "@/features/execution/types";
import { PaperExecutionAdapter } from "@/features/execution/paper-adapter";

export interface PaperRuntimeState {
  botId: string;
  config: GridConfig;
  levels: GridLevel[];
  orders: ExecutionOrder[];
  metrics: RuntimeMetrics;
  status: "idle" | "running" | "paused" | "out_of_range";
}

export class PaperGridEngine {
  private readonly adapter = new PaperExecutionAdapter();

  async start(botId: string, config: GridConfig, referencePrice: string): Promise<PaperRuntimeState> {
    const levels = generateGridLevels(config, referencePrice);
    const orders: ExecutionOrder[] = [];

    for (const level of levels) {
      orders.push(
        await this.adapter.placeOrder({
          clientOrderId: ulid(),
          botId,
          gridLevelId: level.id,
          asset: config.pair,
          side: level.side,
          positionSide: config.positionSide,
          type: "limit",
          quantity: level.quantity,
          price: level.price,
          timeInForce: "GTC",
          reduceOnly: reduceOnlyForGridSide(config.positionSide, level.side),
        }),
      );
    }

    return {
      botId,
      config,
      levels,
      orders,
      status: isOutOfRange(config, referencePrice) ? "out_of_range" : "running",
      metrics: {
        equity: config.capitalAllocation,
        pnl: "0",
        realizedPnl: "0",
        unrealizedPnl: "0",
        volume: "0",
        exposure: "0",
        drawdownPct: "0",
        openOrders: orders.length,
        fills: 0,
      },
    };
  }

  markToMarket(state: PaperRuntimeState, markPrice: string): PaperRuntimeState {
    const exposure = state.orders
      .filter((order) => order.status === "open")
      .reduce((sum, order) => sum.plus(decimal(order.quantity).mul(order.price ?? markPrice)), decimal(0));

    const outOfRange = state.config.autoPauseOutOfRange && isOutOfRange(state.config, markPrice);

    return {
      ...state,
      status: outOfRange ? "out_of_range" : state.status,
      metrics: {
        ...state.metrics,
        exposure: toDecimalString(exposure, 2),
        openOrders: state.orders.filter((order) => order.status === "open").length,
      },
    };
  }
}
