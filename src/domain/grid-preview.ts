import { decimal, toDecimalString } from "@/domain/decimal";
import type { GridConfig } from "@/domain/types";

export interface GridPreview {
  lineCount: number;
  totalNotional: string;
  spacingPct: string;
  profitPerCycle: string;
  worstCaseLoss: string;
  riskRewardRatio: string;
  spacingStatus: "ok" | "tight";
}

export function estimateGridPreview(config: GridConfig): GridPreview {
  const midpoint = decimal(config.lowerPrice).plus(config.upperPrice).div(2);
  const totalNotional = decimal(config.capitalAllocation).mul(config.leverage);
  const spacingPct = estimateEffectiveSpacingPct(config, midpoint);
  const notionalPerGrid = totalNotional.div(config.gridCount);
  const profitPerCycle = notionalPerGrid.mul(spacingPct).div(100);
  const worstCaseLoss = estimateWorstCaseLoss(config, midpoint, totalNotional);
  const reward = estimateTakeProfitReward(config, midpoint, totalNotional);
  const riskRewardRatio = worstCaseLoss.gt(0) ? reward.div(worstCaseLoss) : decimal(0);

  return {
    lineCount: config.gridCount,
    totalNotional: toDecimalString(totalNotional, 2),
    spacingPct: toDecimalString(spacingPct, 3),
    profitPerCycle: toDecimalString(profitPerCycle, 2),
    worstCaseLoss: toDecimalString(worstCaseLoss, 2),
    riskRewardRatio: `${toDecimalString(riskRewardRatio, 2)}x`,
    spacingStatus: spacingPct.gte("0.05") ? "ok" : "tight",
  };
}

function estimateEffectiveSpacingPct(config: GridConfig, midpoint: ReturnType<typeof decimal>) {
  if (config.gridCount < 2 || midpoint.lte(0)) return decimal(0);

  if (config.spacing === "geometric") {
    const ratio = decimal(config.upperPrice).div(config.lowerPrice).pow(decimal(1).div(config.gridCount - 1));
    return ratio.minus(1).mul(100);
  }

  const step = decimal(config.upperPrice).minus(config.lowerPrice).div(config.gridCount - 1);
  return step.div(midpoint).mul(100);
}

function estimateWorstCaseLoss(
  config: GridConfig,
  midpoint: ReturnType<typeof decimal>,
  totalNotional: ReturnType<typeof decimal>,
) {
  if (!config.stopLoss || midpoint.lte(0)) return decimal(0);
  const stopLoss = decimal(config.stopLoss);
  const lossPct =
    config.positionSide === "long" ? midpoint.minus(stopLoss).div(midpoint) : stopLoss.minus(midpoint).div(midpoint);
  return lossPct.gt(0) ? totalNotional.mul(lossPct) : decimal(0);
}

function estimateTakeProfitReward(
  config: GridConfig,
  midpoint: ReturnType<typeof decimal>,
  totalNotional: ReturnType<typeof decimal>,
) {
  if (!config.takeProfit || midpoint.lte(0)) return decimal(0);
  const takeProfit = decimal(config.takeProfit);
  const rewardPct =
    config.positionSide === "long" ? takeProfit.minus(midpoint).div(midpoint) : midpoint.minus(takeProfit).div(midpoint);
  return rewardPct.gt(0) ? totalNotional.mul(rewardPct) : decimal(0);
}
