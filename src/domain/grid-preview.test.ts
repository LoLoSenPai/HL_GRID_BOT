import { describe, expect, it } from "vitest";

import { estimateGridPreview } from "@/domain/grid-preview";
import { defaultBotConfig } from "@/features/bots/sample-data";

describe("grid preview", () => {
  it("matches the auto-sized long risk estimate to stop loss", () => {
    const preview = estimateGridPreview({
      ...defaultBotConfig,
      positionSide: "long",
      lowerPrice: "60000",
      upperPrice: "73000",
      gridCount: 81,
      capitalAllocation: "500",
      leverage: 5,
      stopLoss: "59500",
      takeProfit: "73000",
    });

    expect(preview.lineCount).toBe(81);
    expect(preview.entryOrderCount).toBe(41);
    expect(preview.autoOrderSize).toBe("60.98");
    expect(preview.totalNotional).toBe("2500");
    expect(preview.spacingPct).toBe("0.244");
    expect(preview.profitPerCycle).toBe("0.15");
    expect(preview.worstCaseLoss).toBe("160.66");
    expect(preview.lossToStop).toBe("146.05");
    expect(preview.stopBuffer).toBe("14.61");
    expect(preview.riskRewardRatio).toBe("2.42x");
  });
});
