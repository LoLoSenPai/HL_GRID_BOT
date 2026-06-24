import { describe, expect, it } from "vitest";

import { evaluateChallengeSafety } from "@/features/bots/runtime-safety";

const baseInput = {
  startingBalance: "5000",
  equity: "5000",
  dayStartEquity: "5000",
  dailyLossUsed: "0",
  dailyStopPct: "2.75",
  drawdownFloor: "4700",
};

describe("challenge runtime safety", () => {
  it("stops from Propr dailyLossUsed even when the equity baseline has not crossed", () => {
    const result = evaluateChallengeSafety({
      ...baseInput,
      equity: "4990",
      dailyLossUsed: "140",
    });

    expect(result.dailyLossBreached).toBe(true);
    expect(result.dailyEquityFloorBreached).toBe(false);
    expect(result.breached).toBe(true);
    expect(result.dailyStopAmount).toBe("137.5");
  });

  it("also stops when equity crosses the configured daily floor", () => {
    const result = evaluateChallengeSafety({ ...baseInput, equity: "4862.5" });

    expect(result.dailyEquityFloorBreached).toBe(true);
    expect(result.breached).toBe(true);
    expect(result.dailyFloor).toBe("4862.5");
  });

  it("remains safe while all independent limits have room", () => {
    expect(evaluateChallengeSafety({ ...baseInput, equity: "4900", dailyLossUsed: "100" }).breached).toBe(false);
  });
});
