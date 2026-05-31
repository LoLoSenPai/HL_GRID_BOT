import { describe, expect, it } from "vitest";

import {
  deriveDefaultGridConfigForSide,
  deriveDefaultGridConfigFromPrice,
  deriveGridConfigForPositionSide,
} from "@/domain/grid-defaults";
import { defaultBotConfig } from "@/features/bots/sample-data";

describe("grid defaults", () => {
  it("centers the default long range around the current mark", () => {
    const config = deriveDefaultGridConfigFromPrice(defaultBotConfig, "100000");

    expect(config.lowerPrice).toBe("92000");
    expect(config.upperPrice).toBe("108000");
    expect(config.takeProfit).toBe("108000");
    expect(config.stopLoss).toBe("90896");
  });

  it("uses a stop above the range and take profit below the range for shorts", () => {
    const config = deriveDefaultGridConfigForSide(defaultBotConfig, "short", "100000");

    expect(config.positionSide).toBe("short");
    expect(config.lowerPrice).toBe("92000");
    expect(config.upperPrice).toBe("108000");
    expect(config.takeProfit).toBe("92000");
    expect(config.stopLoss).toBe("109296");
  });

  it("switches side risk bounds without moving an existing range", () => {
    const config = deriveGridConfigForPositionSide(
      {
        ...defaultBotConfig,
        lowerPrice: "60000",
        upperPrice: "73000",
      },
      "short",
    );

    expect(config.lowerPrice).toBe("60000");
    expect(config.upperPrice).toBe("73000");
    expect(config.takeProfit).toBe("60000");
    expect(config.stopLoss).toBe("73876");
  });
});
