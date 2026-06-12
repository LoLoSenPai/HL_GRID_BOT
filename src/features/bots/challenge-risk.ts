import { decimal, toDecimalString } from "@/domain/decimal";
import { estimateGridRisk } from "@/domain/grid-risk";
import type { Bot, GridConfig } from "@/domain/types";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";

const RECOMMENDED_BUDGET_USE = "0.9";

export interface ChallengeRiskPreflight {
  checkedAt: string;
  status: "pass" | "blocked" | "invalid";
  source: ProprChallengeSummary["source"];
  candidateWorstCase: string;
  candidateLossToStop: string;
  candidateStopBuffer: string;
  candidateAutoOrderSize: string;
  candidateEntryOrderCount: number;
  candidateTotalEntryNotional: string;
  committedWorstCase: string;
  dailyRemaining: string;
  dailyStopPct: string;
  dailyStopAmount: string;
  dailyStopFloor: string;
  dailyDistanceToStop: string;
  dailyStopUsedPct: string;
  dailyStatus: "safe" | "warning" | "stop";
  drawdownRemaining: string;
  hardBudget: string;
  remainingBudget: string;
  recommendedCapitalAllocation: string;
  recommendedBudgetUsePct: string;
  blockers: string[];
}

export function buildChallengeRiskPreflight(input: {
  config: GridConfig;
  challenge: ProprChallengeSummary;
  committedBots: Bot[];
  currentBotId?: string;
  markPrice?: string;
  markPrices?: Partial<Record<string, string>>;
}): ChallengeRiskPreflight {
  const blockers: string[] = [];
  const candidateRisk = estimateGridRisk(input.config, input.markPrice);
  const candidateWorstCase = safeDecimal(candidateRisk.bufferedLossToStop);
  const committedWorstCase = input.committedBots
    .filter(
      (bot) =>
        bot.id !== input.currentBotId &&
        bot.config.mode === "propr_live" &&
        ["live", "running", "out_of_range"].includes(bot.status),
    )
    .reduce(
      (total, bot) => total.plus(estimateGridRisk(bot.config, input.markPrices?.[bot.config.pair]).bufferedLossToStop),
      decimal(0),
    );
  const dailyStopPct = decimal(input.config.challengeDailyLossStopPct ?? "2.75");
  const dailyStopAmount = decimal(input.challenge.startingBalance).mul(dailyStopPct).div(100);
  const dailyStopFloor = decimal(input.challenge.dayStartEquity).minus(dailyStopAmount);
  const dailyLossUsed = DecimalMax(
    decimal(0),
    decimal(input.challenge.dayStartEquity).minus(input.challenge.equity),
  );
  const dailyRemaining = DecimalMax(decimal(0), dailyStopAmount.minus(dailyLossUsed));
  const dailyStopUsedPct = dailyStopAmount.gt(0) ? dailyLossUsed.div(dailyStopAmount).mul(100) : decimal(0);
  const drawdownBudget = decimal(input.challenge.highWaterMark).minus(input.challenge.drawdownLimit);
  const drawdownRemaining = drawdownBudget.mul(decimal(100).minus(input.challenge.drawdownUsedPct)).div(100);
  const hardBudget = DecimalMin(dailyRemaining, drawdownRemaining);
  const remainingBudget = DecimalMax(decimal(0), hardBudget.minus(committedWorstCase));

  if (input.challenge.source !== "propr_live") {
    blockers.push(input.challenge.warning ?? "Active Propr challenge could not be synced.");
  }
  if (!input.config.stopLoss) {
    blockers.push("Stop loss is required before deploying a Propr challenge bot.");
  }
  if (!candidateWorstCase.gt(0)) {
    blockers.push("Worst-case loss must be positive and directionally valid before deployment.");
  }
  if (candidateRisk.entryOrderCount === 0) {
    blockers.push("No entry grid orders are available at the current mark price.");
  }
  if (!remainingBudget.gt(0)) {
    blockers.push("No remaining challenge risk budget is available.");
  }
  if (candidateWorstCase.gt(remainingBudget)) {
    blockers.push(
      `Bot worst-case risk ${toDecimalString(candidateWorstCase, 2)} USDC exceeds remaining challenge risk budget ${toDecimalString(remainingBudget, 2)} USDC.`,
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    status: blockers.length ? (candidateWorstCase.gt(0) ? "blocked" : "invalid") : "pass",
    source: input.challenge.source,
    candidateWorstCase: toDecimalString(candidateWorstCase, 2),
    candidateLossToStop: candidateRisk.lossToStop,
    candidateStopBuffer: candidateRisk.stopBuffer,
    candidateAutoOrderSize: candidateRisk.autoOrderSize,
    candidateEntryOrderCount: candidateRisk.entryOrderCount,
    candidateTotalEntryNotional: candidateRisk.totalEntryNotional,
    committedWorstCase: toDecimalString(committedWorstCase, 2),
    dailyRemaining: toDecimalString(dailyRemaining, 2),
    dailyStopPct: toDecimalString(dailyStopPct, 2),
    dailyStopAmount: toDecimalString(dailyStopAmount, 2),
    dailyStopFloor: toDecimalString(dailyStopFloor, 2),
    dailyDistanceToStop: toDecimalString(dailyRemaining, 2),
    dailyStopUsedPct: toDecimalString(dailyStopUsedPct, 1),
    dailyStatus: dailyRemaining.lte(0) ? "stop" : dailyStopUsedPct.gte(80) ? "warning" : "safe",
    drawdownRemaining: toDecimalString(drawdownRemaining, 2),
    hardBudget: toDecimalString(hardBudget, 2),
    remainingBudget: toDecimalString(remainingBudget, 2),
    recommendedCapitalAllocation: recommendedCapitalAllocation(input.config, candidateWorstCase, remainingBudget),
    recommendedBudgetUsePct: toDecimalString(decimal(RECOMMENDED_BUDGET_USE).mul(100), 0),
    blockers,
  };
}

function recommendedCapitalAllocation(
  config: GridConfig,
  candidateWorstCase: ReturnType<typeof decimal>,
  remainingBudget: ReturnType<typeof decimal>,
): string {
  const currentCapital = safeDecimal(config.capitalAllocation);
  if (!currentCapital.gt(0) || !candidateWorstCase.gt(0) || !remainingBudget.gt(0)) return "0";
  const targetBudget = remainingBudget.mul(RECOMMENDED_BUDGET_USE);
  const scale = DecimalMin(decimal(1), targetBudget.div(candidateWorstCase));
  return toDecimalString(currentCapital.mul(scale), 2);
}

function DecimalMin(a: ReturnType<typeof decimal>, b: ReturnType<typeof decimal>) {
  return a.lte(b) ? a : b;
}

function DecimalMax(a: ReturnType<typeof decimal>, b: ReturnType<typeof decimal>) {
  return a.gte(b) ? a : b;
}

function safeDecimal(value: string) {
  try {
    return decimal(value);
  } catch {
    return decimal(0);
  }
}
