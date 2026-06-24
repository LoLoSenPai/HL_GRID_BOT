import { afterEach, describe, expect, it, vi } from "vitest";

import { accountIdMatches, ProprClient, proprPositionSideForIntent } from "@/features/propr/client";
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

  it("keeps the position being reduced on reduce-only exits", () => {
    expect(proprPositionSideForIntent({ ...baseIntent, side: "sell", positionSide: "long", reduceOnly: true })).toBe(
      "long",
    );
    expect(proprPositionSideForIntent({ ...baseIntent, side: "buy", positionSide: "short", reduceOnly: true })).toBe(
      "short",
    );
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
      positionSide: "long",
      triggerPrice: "62000",
      positionId: "position-1",
      reduceOnly: true,
      closePosition: true,
    });
  });
});

describe("Propr account selection", () => {
  it("matches a short account id against Propr urn account ids", () => {
    expect(accountIdMatches("urn:prp-account:HRjAbEbasfZ1", "HRjAbEbasfZ1")).toBe(true);
    expect(accountIdMatches("urn:prp-account:HRjAbEbasfZ1", "other")).toBe(false);
  });
});
