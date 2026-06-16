import { describe, expect, it } from "vitest";

import { buildChallengeRiskPreflight } from "@/features/bots/challenge-risk";
import { defaultBotConfig } from "@/features/bots/sample-data";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";

const challenge: ProprChallengeSummary = {
  source: "propr_live",
  checkedAt: "2026-06-01T00:00:00.000Z",
  status: "active",
  label: "Classic 1-Step challenge",
  ruleSet: {
    kind: "classic_1_step",
    label: "Classic 1-Step",
    profitTargetPct: "10",
    dailyLossPct: "3",
    maxDrawdownPct: "6",
    drawdownMode: "static",
  },
  startingBalance: "5000",
  balance: "5000",
  equity: "5000",
  realizedPnl: "0",
  unrealizedPnl: "0",
  profitTarget: "500",
  profitProgressPct: "0",
  dailyLossLimit: "150",
  dayStartEquity: "5000",
  dailyLossUsed: "0",
  dailyLossUsedPct: "0",
  drawdownLimit: "4700",
  drawdownUsedPct: "0",
  highWaterMark: "5000",
};

describe("challenge risk preflight", () => {
  it("warns on oversized configs and recommends lower capital", () => {
    const preflight = buildChallengeRiskPreflight({
      config: {
        ...defaultBotConfig,
        lowerPrice: "92000",
        upperPrice: "108000",
        stopLoss: "90896",
        takeProfit: "108000",
        capitalAllocation: "2500",
        leverage: 2,
        mode: "propr_live",
      },
      challenge,
      committedBots: [],
    });

    expect(preflight.status).toBe("warning");
    expect(preflight.blockers).toEqual([]);
    expect(preflight.warnings[0]).toContain("exceeds remaining challenge risk budget");
    expect(Number(preflight.candidateWorstCase)).toBeGreaterThan(150);
    expect(Number(preflight.recommendedCapitalAllocation)).toBeLessThan(2500);
  });

  it("passes configs inside the remaining challenge budget", () => {
    const preflight = buildChallengeRiskPreflight({
      config: {
        ...defaultBotConfig,
        lowerPrice: "92000",
        upperPrice: "108000",
        stopLoss: "90896",
        takeProfit: "108000",
        capitalAllocation: "500",
        leverage: 2,
        mode: "propr_live",
      },
      challenge,
      committedBots: [],
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.blockers).toEqual([]);
    expect(preflight.warnings).toEqual([]);
  });
});
