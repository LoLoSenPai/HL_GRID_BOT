import { afterEach, describe, expect, it, vi } from "vitest";

import { accountIdMatches, ProprClient, proprPositionSideForIntent } from "@/features/propr/client";
import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";
import type { OrderIntent } from "@/features/execution/types";

const baseIntent: OrderIntent = {
  asset: "BTC",
  side: "buy",
  positionSide: "long",
  type: "limit",
  quantity: "0.001",
  price: "63000",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Propr order mapping", () => {
  it("keeps entry positionSide unchanged", () => {
    expect(proprPositionSideForIntent({ ...baseIntent, side: "sell", positionSide: "short" })).toBe("short");
  });

  it("aligns non-conditional reduce-only exits with Propr live side validation", () => {
    expect(
      proprPositionSideForIntent({ ...baseIntent, type: "limit", side: "sell", positionSide: "long", reduceOnly: true }),
    ).toBe(
      "short",
    );
    expect(
      proprPositionSideForIntent({ ...baseIntent, type: "market", side: "buy", positionSide: "short", reduceOnly: true }),
    ).toBe(
      "long",
    );
  });

  it("aligns conditional protections with Propr live side validation", () => {
    expect(
      proprPositionSideForIntent({ ...baseIntent, type: "stop_market", side: "sell", positionSide: "long", reduceOnly: true }),
    ).toBe("short");
    expect(
      proprPositionSideForIntent({ ...baseIntent, type: "take_profit_market", side: "buy", positionSide: "short", reduceOnly: true }),
    ).toBe("long");
  });

  it("deduplicates concurrent account setup requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ attemptId: "attempt-1", challengeId: "challenge-1", accountId: "account-1", status: "active" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new ProprClient({ apiKey: "test-key", baseUrl: "https://api.propr.test" });

    await Promise.all([client.setup(), client.setup(), client.setup()]);

    expect(client.accountId).toBe("account-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches native protective orders to the Propr position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new ProprClient({ apiKey: "test-key", baseUrl: "https://api.propr.test" });
    client.accountId = "account-1";

    await client.createOrder({
      ...baseIntent,
      type: "stop_market",
      side: "sell",
      triggerPrice: "62000",
      positionId: "position-1",
      reduceOnly: true,
      closePosition: true,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { orders: Array<Record<string, unknown>> };
    expect(body.orders[0]).toMatchObject({
      type: "stop_market",
      side: "sell",
      positionSide: "short",
      triggerPrice: "62000",
      positionId: "position-1",
      reduceOnly: true,
      closePosition: true,
    });
  });

  it("keeps intent-owned fields in local execution orders when Propr response is partial", async () => {
    const client = {
      accountId: "account-1",
      setup: vi.fn(),
      healthServices: vi.fn(),
      getUser: vi.fn(),
      createOrder: vi.fn().mockResolvedValue([
        {
          orderId: "order-1",
          intentId: "intent-1",
          base: "BTC",
          side: "sell",
          positionSide: "short",
          type: "stop_market",
          quantity: "0.001",
          price: null,
          triggerPrice: null,
          status: "open",
          cumulativeQuantity: "0",
          averageFillPrice: null,
          reduceOnly: true,
          closePosition: null,
          createdAt: "2026-06-28T00:00:00.000Z",
          updatedAt: "2026-06-28T00:00:00.000Z",
        },
      ]),
    } as unknown as ProprClient;

    const adapter = new ProprExecutionAdapter(client);
    const order = await adapter.placeOrder({
      ...baseIntent,
      clientOrderId: "intent-1",
      side: "sell",
      positionSide: "long",
      type: "stop_market",
      triggerPrice: "62000",
      reduceOnly: true,
      closePosition: true,
    });

    expect(order.positionSide).toBe("long");
    expect(order.triggerPrice).toBe("62000");
    expect(order.closePosition).toBe(true);
  });
});

describe("Propr account selection", () => {
  it("matches a short account id against Propr urn account ids", () => {
    expect(accountIdMatches("urn:prp-account:HRjAbEbasfZ1", "HRjAbEbasfZ1")).toBe(true);
    expect(accountIdMatches("urn:prp-account:HRjAbEbasfZ1", "other")).toBe(false);
  });
});
