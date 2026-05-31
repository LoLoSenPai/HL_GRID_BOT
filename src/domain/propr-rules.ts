import { Decimal, decimal, toDecimalString } from "@/domain/decimal";
import { getMarketDefinition, type MarketCategory } from "@/domain/markets";

export type ProprChallengeKind = "classic_1_step" | "classic_2_step";

export interface ProprChallengeRuleSet {
  kind: ProprChallengeKind;
  label: string;
  profitTargetPct: string;
  dailyLossPct: string;
  maxDrawdownPct: string;
  drawdownMode: "static" | "trailing";
}

export const PROPR_CLASSIC_1_STEP_RULES: ProprChallengeRuleSet = {
  kind: "classic_1_step",
  label: "Classic 1-Step",
  profitTargetPct: "10",
  dailyLossPct: "3",
  maxDrawdownPct: "6",
  drawdownMode: "static",
};

export const PROPR_CLASSIC_2_STEP_RULES: ProprChallengeRuleSet = {
  kind: "classic_2_step",
  label: "Classic 2-Step",
  profitTargetPct: "10",
  dailyLossPct: "5",
  maxDrawdownPct: "8",
  drawdownMode: "trailing",
};

export function maxProprLeverageForAsset(asset: string): number {
  if (asset === "BTC" || asset === "ETH") return 5;
  return PROPR_CATEGORY_LEVERAGE[getMarketDefinition(asset).category] ?? 2;
}

export function computeProfitTarget(startingBalance: string, rules: ProprChallengeRuleSet): string {
  return toDecimalString(decimal(startingBalance).mul(rules.profitTargetPct).div(100), 2);
}

export function computeDailyLossLimit(startingBalance: string, rules: ProprChallengeRuleSet): string {
  return toDecimalString(decimal(startingBalance).mul(rules.dailyLossPct).div(100), 2);
}

export function computeDrawdownLimit(
  startingBalance: string,
  highWaterMark: string,
  rules: ProprChallengeRuleSet,
): string {
  const starting = decimal(startingBalance);
  const drawdownAmount = starting.mul(rules.maxDrawdownPct).div(100);

  if (rules.drawdownMode === "static") {
    return toDecimalString(starting.minus(drawdownAmount), 2);
  }

  const trailingLimit = decimal(highWaterMark).minus(drawdownAmount);
  return toDecimalString(Decimal.min(starting, trailingLimit), 2);
}

const PROPR_CATEGORY_LEVERAGE: Record<MarketCategory, number> = {
  crypto: 2,
  equity: 4,
  pre_ipo: 4,
  commodity: 5,
  index: 5,
  fx: 4,
};
