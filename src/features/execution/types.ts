import type {
  DecimalString,
  MarketSymbol,
  OrderSide,
  OrderType,
  PositionSide,
  TimeInForce,
} from "@/domain/types";

export interface ExecutionAdapterHealth {
  ok: boolean;
  mode: "mock" | "paper" | "propr_live";
  reason?: string;
  details?: Record<string, unknown>;
}

export interface OrderIntent {
  clientOrderId?: string;
  botId?: string;
  gridLevelId?: string;
  asset: MarketSymbol;
  side: OrderSide;
  positionSide: PositionSide;
  type: OrderType;
  quantity: DecimalString;
  price?: DecimalString;
  triggerPrice?: DecimalString;
  positionId?: string;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  closePosition?: boolean;
}

export interface ExecutionOrder {
  id: string;
  providerOrderId?: string;
  intentId: string;
  botId?: string;
  gridLevelId?: string;
  asset: MarketSymbol;
  side: OrderSide;
  positionSide: PositionSide;
  type: OrderType;
  quantity: DecimalString;
  price?: DecimalString;
  triggerPrice?: DecimalString;
  status: "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  cumulativeQuantity: DecimalString;
  averageFillPrice?: DecimalString;
  reduceOnly: boolean;
  closePosition?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionPosition {
  id: string;
  providerPositionId?: string;
  asset: MarketSymbol;
  positionSide: PositionSide;
  quantity: DecimalString;
  entryPrice: DecimalString;
  markPrice: DecimalString;
  unrealizedPnl: DecimalString;
  realizedPnl: DecimalString;
  leverage: DecimalString;
  liquidationPrice?: DecimalString;
  marginUsed?: DecimalString;
  cumulativeFunding?: DecimalString;
  cumulativeTradingFees?: DecimalString;
  returnOnEquity?: DecimalString;
}

export interface ExecutionTrade {
  id: string;
  providerTradeId?: string;
  orderId: string;
  asset: MarketSymbol;
  side: OrderSide;
  quantity: DecimalString;
  price: DecimalString;
  fee: DecimalString;
  realizedPnl: DecimalString;
  executedAt: string;
}

export interface ExecutionAdapter {
  readonly mode: "mock" | "paper" | "propr_live";
  health(): Promise<ExecutionAdapterHealth>;
  placeOrder(intent: OrderIntent): Promise<ExecutionOrder>;
  cancelOrder(orderId: string): Promise<ExecutionOrder | null>;
  cancelAll(asset?: MarketSymbol): Promise<ExecutionOrder[]>;
  getOpenOrders(asset?: MarketSymbol): Promise<ExecutionOrder[]>;
  getPositions(asset?: MarketSymbol): Promise<ExecutionPosition[]>;
  getTrades(asset?: MarketSymbol): Promise<ExecutionTrade[]>;
  setLeverage(asset: MarketSymbol, leverage: number): Promise<void>;
}
