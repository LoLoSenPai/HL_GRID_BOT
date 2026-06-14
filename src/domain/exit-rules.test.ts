import { describe, expect, it } from "vitest";

import { evaluateBotExitTrigger } from "@/domain/exit-rules";
import { defaultBotConfig } from "@/features/bots/sample-data";

describe("bot exit rules", () => {
  it("triggers a long stop loss below the stop price", () => {
    const result = evaluateBotExitTrigger(
      { ...defaultBotConfig, positionSide: "long", stopLoss: "63000", takeProfit: "65000" },
      "62999.9",
    );

    expect(result?.trigger).toBe("stop_loss");
    expect(result?.triggerPrice).toBe("63000");
  });

  it("triggers a short stop loss above the stop price", () => {
    const result = evaluateBotExitTrigger(
      { ...defaultBotConfig, positionSide: "short", stopLoss: "65100", takeProfit: "62900" },
      "65257",
    );

    expect(result?.trigger).toBe("stop_loss");
    expect(result?.triggerPrice).toBe("65100");
  });

  it("triggers a long take profit above the take-profit price", () => {
    const result = evaluateBotExitTrigger(
      { ...defaultBotConfig, positionSide: "long", stopLoss: "62900", takeProfit: "65100" },
      "65100",
    );

    expect(result?.trigger).toBe("take_profit");
  });

  it("triggers a short take profit below the take-profit price", () => {
    const result = evaluateBotExitTrigger(
      { ...defaultBotConfig, positionSide: "short", stopLoss: "65100", takeProfit: "62900" },
      "62899",
    );

    expect(result?.trigger).toBe("take_profit");
  });

  it("does not trigger inside the exit range", () => {
    const result = evaluateBotExitTrigger(
      { ...defaultBotConfig, positionSide: "short", stopLoss: "65100", takeProfit: "62900" },
      "64000",
    );

    expect(result?.trigger).toBeNull();
  });
});
