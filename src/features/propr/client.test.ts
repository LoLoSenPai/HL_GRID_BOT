import { describe, expect, it } from "vitest";

import { proprPositionSideForIntent } from "@/features/propr/client";
import type { OrderIntent } from "@/features/execution/types";

const baseIntent: OrderIntent = {
  asset: "BTC",
  side: "buy",
  positionSide: "long",
  type: "limit",
  quantity: "0.001",
  price: "63000",
};

describe("Propr order mapping", () => {
  it("keeps entry positionSide unchanged", () => {
    expect(proprPositionSideForIntent({ ...baseIntent, side: "sell", positionSide: "short" })).toBe("short");
  });

  it("aligns reduce-only exits with Propr live side validation", () => {
    expect(proprPositionSideForIntent({ ...baseIntent, side: "sell", positionSide: "long", reduceOnly: true })).toBe(
      "short",
    );
    expect(proprPositionSideForIntent({ ...baseIntent, side: "buy", positionSide: "short", reduceOnly: true })).toBe(
      "long",
    );
  });
});
