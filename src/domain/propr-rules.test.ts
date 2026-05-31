import { describe, expect, it } from "vitest";

import {
  computeDailyLossLimit,
  computeDrawdownLimit,
  computeProfitTarget,
  maxProprLeverageForAsset,
  PROPR_CLASSIC_1_STEP_RULES,
  PROPR_CLASSIC_2_STEP_RULES,
} from "@/domain/propr-rules";

describe("Propr rules", () => {
  it("matches current Propr challenge limits", () => {
    expect(computeProfitTarget("5000", PROPR_CLASSIC_1_STEP_RULES)).toBe("500");
    expect(computeDailyLossLimit("5000", PROPR_CLASSIC_1_STEP_RULES)).toBe("150");
    expect(computeDrawdownLimit("5000", "5000", PROPR_CLASSIC_1_STEP_RULES)).toBe("4700");

    expect(computeDailyLossLimit("5000", PROPR_CLASSIC_2_STEP_RULES)).toBe("250");
    expect(computeDrawdownLimit("5000", "5200", PROPR_CLASSIC_2_STEP_RULES)).toBe("4800");
  });

  it("applies Propr leverage classes", () => {
    expect(maxProprLeverageForAsset("BTC")).toBe(5);
    expect(maxProprLeverageForAsset("ETH")).toBe(5);
    expect(maxProprLeverageForAsset("SOL")).toBe(2);
    expect(maxProprLeverageForAsset("HYPE")).toBe(2);
    expect(maxProprLeverageForAsset("xyz:CRCL")).toBe(4);
    expect(maxProprLeverageForAsset("xyz:TSLA")).toBe(4);
    expect(maxProprLeverageForAsset("xyz:NVDA")).toBe(4);
    expect(maxProprLeverageForAsset("xyz:MU")).toBe(4);
    expect(maxProprLeverageForAsset("xyz:GOLD")).toBe(5);
    expect(maxProprLeverageForAsset("xyz:CL")).toBe(5);
  });
});
