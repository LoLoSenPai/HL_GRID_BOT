import { describe, expect, it } from "vitest";

import { estimateAtr, estimatePerpGridSizing } from "@/domain/perp-grid-sizing";
import type { Candle } from "@/features/market-data/types";

describe("perp grid sizing", () => {
  it("sizes long grid notional from accepted risk and stop distance beyond the grid", () => {
    const sizing = estimatePerpGridSizing({
      totalCapital: "5000",
      riskPct: "1",
      positionSide: "long",
      lowerPrice: "60000",
      upperPrice: "73000",
      stopPrice: "59500",
      leverage: 5,
      roundTripFeePct: "0.03",
    });

    expect(sizing.riskDollars).toBe("50");
    expect(sizing.averageGridPrice).toBe("66500");
    expect(sizing.drawdownToStopPct).toBe("10.5263");
    expect(sizing.riskSizedNotional).toBe("475");
    expect(sizing.marginRequired).toBe("95");
  });

  it("mirrors stop distance for short grids", () => {
    const sizing = estimatePerpGridSizing({
      totalCapital: "5000",
      riskPct: "1",
      positionSide: "short",
      lowerPrice: "60000",
      upperPrice: "73000",
      stopPrice: "74000",
      leverage: 5,
    });

    expect(sizing.drawdownToStopPct).toBe("11.2782");
    expect(sizing.riskSizedNotional).toBe("443.33");
  });

  it("uses fee and ATR floors to recommend grid order count", () => {
    const sizing = estimatePerpGridSizing({
      totalCapital: "5000",
      riskPct: "1",
      positionSide: "long",
      lowerPrice: "60000",
      upperPrice: "73000",
      stopPrice: "59500",
      leverage: 5,
      roundTripFeePct: "0.03",
      atrLocal: "1000",
    });

    expect(sizing.feeSpacingMinPct).toBe("0.12");
    expect(sizing.atrSpacingMinPct).toBe("0.7519");
    expect(sizing.spacingMinPct).toBe("0.7519");
    expect(sizing.recommendedGridOrders).toBe(26);
  });

  it("estimates ATR from candles", () => {
    const candles: Candle[] = [
      { time: 1, open: "100", high: "105", low: "99", close: "102", volume: "0" },
      { time: 2, open: "102", high: "108", low: "101", close: "107", volume: "0" },
      { time: 3, open: "107", high: "109", low: "100", close: "101", volume: "0" },
    ];

    expect(estimateAtr(candles, 2)).toBe("8");
  });
});
