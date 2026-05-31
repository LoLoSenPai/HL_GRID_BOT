import { describe, expect, it } from "vitest";

import { calculateOrderQuantity, generateGridLevels, generateGridPrices, isOutOfRange } from "@/domain/grid";
import type { GridConfig } from "@/domain/types";

const config: GridConfig = {
  pair: "BTC",
  positionSide: "long",
  lowerPrice: "90000",
  upperPrice: "100000",
  gridCount: 3,
  capitalAllocation: "1000",
  leverage: 2,
  spacing: "arithmetic",
  orderSize: "100",
  maxDrawdownPct: "10",
  autoPauseOutOfRange: true,
  autoRecenter: false,
  mode: "paper",
};

describe("grid math", () => {
  it("generates arithmetic levels including range bounds", () => {
    expect(generateGridPrices(config)).toEqual(["90000", "95000", "100000"]);
  });

  it("assigns buy levels below the reference and sell levels above it", () => {
    const levels = generateGridLevels(config, "95000");
    expect(levels.map((level) => level.side)).toEqual(["buy", "buy", "sell"]);
  });

  it("calculates asset quantity from USD order size without native float output", () => {
    expect(calculateOrderQuantity("BTC", "100", "100000")).toBe("0.001");
  });

  it("detects prices outside the range", () => {
    expect(isOutOfRange(config, "89999")).toBe(true);
    expect(isOutOfRange(config, "95000")).toBe(false);
  });
});
