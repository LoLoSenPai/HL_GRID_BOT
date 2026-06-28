import type { MarketSymbol } from "@/domain/types";
import type {
  ExecutionAdapter,
  ExecutionAdapterHealth,
  ExecutionOrder,
  ExecutionPosition,
  ExecutionTrade,
  OrderIntent,
} from "@/features/execution/types";
import { createProprClient, ProprAPIError, type ProprClient } from "@/features/propr/client";

function mapOrder(order: Awaited<ReturnType<ProprClient["getOrders"]>>[number]): ExecutionOrder {
  return {
    id: order.orderId,
    providerOrderId: order.orderId,
    intentId: order.intentId,
    asset: order.base,
    side: order.side as ExecutionOrder["side"],
    positionSide: order.positionSide as ExecutionOrder["positionSide"],
    type: order.type as ExecutionOrder["type"],
    quantity: order.quantity,
    price: order.price ?? undefined,
    triggerPrice: order.triggerPrice ?? undefined,
    status: normalizeOrderStatus(order.status),
    cumulativeQuantity: order.cumulativeQuantity,
    averageFillPrice: order.averageFillPrice ?? undefined,
    reduceOnly: order.reduceOnly,
    closePosition: order.closePosition,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function normalizeOrderStatus(status: string): ExecutionOrder["status"] {
  const normalized = status.toLowerCase().replaceAll("-", "_");
  if (normalized === "canceled" || normalized === "expired" || normalized === "closed") return "cancelled";
  if (
    normalized === "pending" ||
    normalized === "open" ||
    normalized === "partially_filled" ||
    normalized === "filled" ||
    normalized === "cancelled" ||
    normalized === "rejected"
  ) {
    return normalized;
  }
  return "open";
}

function isOpenLikeOrder(order: ExecutionOrder): boolean {
  return ["pending", "open", "partially_filled"].includes(order.status);
}

export class ProprExecutionAdapter implements ExecutionAdapter {
  readonly mode = "propr_live" as const;

  constructor(private readonly client = createProprClient()) {}

  async health(): Promise<ExecutionAdapterHealth> {
    try {
      const services = await this.client.healthServices();
      await this.client.getUser();
      await this.client.setup();
      return {
        ok: services.core === "OK" || services.gateway === "OK",
        mode: this.mode,
        details: services,
      };
    } catch (error) {
      return {
        ok: false,
        mode: this.mode,
        reason:
          error instanceof ProprAPIError && error.statusCode === 401
            ? "Propr API key is invalid or unauthorized."
            : error instanceof Error
              ? error.message
              : "Unknown Propr health failure.",
      };
    }
  }

  async placeOrder(intent: OrderIntent): Promise<ExecutionOrder> {
    await this.assertReady();
    const [order] = await this.client.createOrder(intent);
    if (!order) throw new Error("Propr did not return an order.");
    const mappedOrder = mapOrder(order);
    return {
      ...mappedOrder,
      botId: intent.botId,
      gridLevelId: intent.gridLevelId,
      positionSide: intent.positionSide,
      price: mappedOrder.price ?? intent.price,
      triggerPrice: mappedOrder.triggerPrice ?? intent.triggerPrice,
      closePosition: intent.closePosition ?? mappedOrder.closePosition,
    };
  }

  async cancelOrder(orderId: string): Promise<ExecutionOrder | null> {
    await this.assertReady();
    const order = await this.client.cancelOrder(orderId);
    return order ? mapOrder(order) : null;
  }

  async cancelAll(asset?: MarketSymbol): Promise<ExecutionOrder[]> {
    await this.assertReady();
    const openOrders = await this.getOpenOrders(asset);
    const cancelled: ExecutionOrder[] = [];
    for (const order of openOrders) {
      const result = await this.cancelOrder(order.id);
      if (result) cancelled.push(result);
    }
    return cancelled;
  }

  async getOpenOrders(asset?: MarketSymbol): Promise<ExecutionOrder[]> {
    await this.assertReady();
    const params = {
      ...(asset ? { base: asset } : {}),
      limit: 100,
      offset: 0,
    };
    const [openOrders, recentOrders] = await Promise.all([
      this.client.getOrders({ ...params, status: "open" }),
      this.client.getOrders(params),
    ]);
    const ordersById = new Map(openOrders.map((order) => [order.orderId, order]));
    for (const order of recentOrders) {
      if (!ordersById.has(order.orderId)) ordersById.set(order.orderId, order);
    }
    return [...ordersById.values()].map(mapOrder).filter(isOpenLikeOrder);
  }

  async getPositions(asset?: MarketSymbol): Promise<ExecutionPosition[]> {
    await this.assertReady();
    const positions = await this.client.getPositions(asset ? { base: asset } : {});
    return positions.map((position) => ({
      id: position.positionId,
      providerPositionId: position.positionId,
      asset: position.base,
      positionSide: position.positionSide as ExecutionPosition["positionSide"],
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      unrealizedPnl: position.unrealizedPnl,
      realizedPnl: position.realizedPnl,
      leverage: position.leverage,
      liquidationPrice: position.liquidationPrice,
      marginUsed: position.marginUsed,
      cumulativeFunding: position.cumulativeFunding,
      cumulativeTradingFees: position.cumulativeTradingFees,
      returnOnEquity: position.returnOnEquity,
    }));
  }

  async getTrades(asset?: MarketSymbol): Promise<ExecutionTrade[]> {
    await this.assertReady();
    const trades = await this.client.getTrades(asset ? { base: asset } : {});
    return trades.map((trade) => ({
      id: trade.tradeId,
      providerTradeId: trade.tradeId,
      orderId: trade.orderId,
      asset: trade.asset,
      side: trade.side as ExecutionTrade["side"],
      quantity: trade.quantity,
      price: trade.price,
      fee: trade.fee,
      realizedPnl: trade.realizedPnl,
      executedAt: trade.executedAt,
    }));
  }

  async setLeverage(asset: MarketSymbol, leverage: number): Promise<void> {
    await this.assertReady();
    await this.client.setLeverage(asset, leverage);
  }

  private async assertReady(): Promise<void> {
    if (!this.client.accountId) {
      await this.client.setup();
    }
  }
}

export function createProprExecutionAdapter(
  ownerUser?: string,
  options: { timeoutMs?: number } = {},
): ProprExecutionAdapter {
  return new ProprExecutionAdapter(createProprClient({ ownerUser, timeoutMs: options.timeoutMs }));
}
