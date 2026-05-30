import { ulid } from "ulid";

import type {
  ExecutionAdapter,
  ExecutionAdapterHealth,
  ExecutionOrder,
  ExecutionPosition,
  ExecutionTrade,
  OrderIntent,
} from "@/features/execution/types";
import type { MarketSymbol } from "@/domain/types";

export class MockExecutionAdapter implements ExecutionAdapter {
  readonly mode: "mock" | "paper" = "mock";
  protected orders = new Map<string, ExecutionOrder>();
  protected trades: ExecutionTrade[] = [];
  protected positions = new Map<MarketSymbol, ExecutionPosition>();

  async health(): Promise<ExecutionAdapterHealth> {
    return { ok: true, mode: this.mode };
  }

  async placeOrder(intent: OrderIntent): Promise<ExecutionOrder> {
    const now = new Date().toISOString();
    const intentId = intent.clientOrderId ?? ulid();
    const order: ExecutionOrder = {
      id: ulid(),
      intentId,
      botId: intent.botId,
      gridLevelId: intent.gridLevelId,
      asset: intent.asset,
      side: intent.side,
      positionSide: intent.positionSide,
      type: intent.type,
      quantity: intent.quantity,
      price: intent.price,
      status: intent.type === "market" ? "filled" : "open",
      cumulativeQuantity: intent.type === "market" ? intent.quantity : "0",
      averageFillPrice: intent.price,
      reduceOnly: intent.reduceOnly ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);

    if (order.status === "filled") {
      this.trades.push({
        id: ulid(),
        orderId: order.id,
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        price: order.price ?? "0",
        fee: "0",
        realizedPnl: "0",
        executedAt: now,
      });
    }

    return order;
  }

  async cancelOrder(orderId: string): Promise<ExecutionOrder | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "open") return null;
    const updated: ExecutionOrder = {
      ...order,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(orderId, updated);
    return updated;
  }

  async cancelAll(asset?: MarketSymbol): Promise<ExecutionOrder[]> {
    const cancelled: ExecutionOrder[] = [];
    for (const order of this.orders.values()) {
      if (order.status !== "open") continue;
      if (asset && order.asset !== asset) continue;
      const result = await this.cancelOrder(order.id);
      if (result) cancelled.push(result);
    }
    return cancelled;
  }

  async getOpenOrders(asset?: MarketSymbol): Promise<ExecutionOrder[]> {
    return Array.from(this.orders.values()).filter(
      (order) => order.status === "open" && (!asset || order.asset === asset),
    );
  }

  async getPositions(asset?: MarketSymbol): Promise<ExecutionPosition[]> {
    return Array.from(this.positions.values()).filter(
      (position) => !asset || position.asset === asset,
    );
  }

  async getTrades(asset?: MarketSymbol): Promise<ExecutionTrade[]> {
    return this.trades.filter((trade) => !asset || trade.asset === asset);
  }

  async setLeverage(): Promise<void> {
    return;
  }
}
