import { decimal, toDecimalString } from "@/domain/decimal";
import { MockExecutionAdapter } from "@/features/execution/mock-adapter";
import type { ExecutionOrder, OrderIntent } from "@/features/execution/types";

export class PaperExecutionAdapter extends MockExecutionAdapter {
  readonly mode = "paper" as const;

  async health() {
    return { ok: true, mode: this.mode };
  }

  async placeOrder(intent: OrderIntent): Promise<ExecutionOrder> {
    const order = await super.placeOrder(intent);
    if (intent.type !== "market") return order;

    const mark = intent.price ?? "0";
    const existing = this.positions.get(intent.asset);
    const signedQty =
      intent.side === "buy" ? decimal(intent.quantity) : decimal(intent.quantity).neg();

    if (!existing) {
      this.positions.set(intent.asset, {
        id: `${intent.asset}-paper-position`,
        asset: intent.asset,
        positionSide: intent.positionSide,
        quantity: toDecimalString(signedQty.abs(), 8),
        entryPrice: mark,
        markPrice: mark,
        unrealizedPnl: "0",
        realizedPnl: "0",
        leverage: "1",
      });
      return order;
    }

    const nextQuantity =
      intent.side === "buy"
        ? decimal(existing.quantity).plus(intent.quantity)
        : decimal(existing.quantity).minus(intent.quantity);

    this.positions.set(intent.asset, {
      ...existing,
      quantity: toDecimalString(DecimalMaxZero(nextQuantity), 8),
      markPrice: mark,
    });

    return order;
  }
}

function DecimalMaxZero(value: ReturnType<typeof decimal>) {
  return value.lt(0) ? decimal(0) : value;
}
