import { describe, expect, it } from "vitest";

import { evaluateRuntimeRisk, validateBotConfig, validateOrderIntent } from "@/domain/risk";
import type { GridConfig } from "@/domain/types";

const config: GridConfig = {
  pair: "SOL",
  positionSide: "long",
  lowerPrice: "140",
  upperPrice: "180",
  gridCount: 12,
  capitalAllocation: "1000",
  leverage: 2,
  spacing: "arithmetic",
  orderSize: "25",
  maxDrawdownPct: "8",
  challengeDailyLossStopPct: "2.75",
  autoPauseOutOfRange: true,
  autoRecenter: false,
  mode: "paper",
};

describe("risk manager", () => {
  it("accepts a valid bot config", () => {
    expect(validateBotConfig(config).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("rejects leverage above the asset limit", () => {
    const issues = validateBotConfig({ ...config, leverage: 5 });
    expect(issues.some((issue) => issue.code === "leverage_limit")).toBe(true);
  });

  it("rejects small non-reducing orders", () => {
    const issues = validateOrderIntent({
      asset: "BTC",
      leverage: 2,
      notionalUsd: "5",
    });
    expect(issues.some((issue) => issue.code === "min_notional")).toBe(true);
  });

  it("pauses runtime when out of range or kill switch is active", () => {
    const issues = evaluateRuntimeRisk({
      config,
      markPrice: "190",
      globalExposureUsd: "100",
      killSwitchActive: true,
      metrics: {
        equity: "1000",
        pnl: "0",
        realizedPnl: "0",
        unrealizedPnl: "0",
        volume: "0",
        exposure: "0",
        drawdownPct: "0",
        openOrders: 0,
        fills: 0,
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(["kill_switch", "out_of_range"]);
  });
});
