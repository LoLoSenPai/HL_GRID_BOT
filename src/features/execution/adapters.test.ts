import { describe, expect, it } from "vitest";

import { MockExecutionAdapter } from "@/features/execution/mock-adapter";
import { PaperExecutionAdapter } from "@/features/execution/paper-adapter";

describe("execution adapters", () => {
  it("keeps mock limit orders open and cancellable", async () => {
    const adapter = new MockExecutionAdapter();
    const order = await adapter.placeOrder({
      asset: "BTC",
      side: "buy",
      positionSide: "long",
      type: "limit",
      quantity: "0.001",
      price: "90000",
    });

    expect(order.status).toBe("open");
    expect(await adapter.getOpenOrders("BTC")).toHaveLength(1);
    expect(await adapter.cancelOrder(order.id)).toMatchObject({ status: "cancelled" });
  });

  it("fills paper market orders and records trades", async () => {
    const adapter = new PaperExecutionAdapter();
    const order = await adapter.placeOrder({
      asset: "ETH",
      side: "buy",
      positionSide: "long",
      type: "market",
      quantity: "0.1",
      price: "3500",
    });

    expect(order.status).toBe("filled");
    expect(await adapter.getTrades("ETH")).toHaveLength(1);
    expect(await adapter.getPositions("ETH")).toHaveLength(1);
  });
});
