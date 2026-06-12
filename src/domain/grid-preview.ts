import { decimal, toDecimalString } from "@/domain/decimal";
import { estimateGridRisk } from "@/domain/grid-risk";
import type { GridConfig } from "@/domain/types";

export interface GridPreview {
  lineCount: number;
  entryOrderCount: number;
  autoOrderSize: string;
  totalNotional: string;
  spacingPct: string;
  profitPerCycle: string;
  worstCaseLoss: string;
  lossToStop: string;
  stopBuffer: string;
  riskRewardRatio: string;
  spacingStatus: "ok" | "tight";
}

const EMPTY_PREVIEW: GridPreview = {
  lineCount: 0,
  entryOrderCount: 0,
  autoOrderSize: "0",
  totalNotional: "0",
  spacingPct: "0",
  profitPerCycle: "0",
  worstCaseLoss: "0",
  lossToStop: "0",
  stopBuffer: "0",
  riskRewardRatio: "0x",
  spacingStatus: "tight",
};

export function estimateGridPreview(config: GridConfig): GridPreview {
  try {
    const lowerPrice = decimal(config.lowerPrice);
    const upperPrice = decimal(config.upperPrice);
    const gridCount = Number(config.gridCount);
    const totalNotional = decimal(config.capitalAllocation).mul(config.leverage);

    if (!lowerPrice.gt(0) || !upperPrice.gt(lowerPrice) || gridCount < 2 || !totalNotional.gt(0)) {
      return { ...EMPTY_PREVIEW, lineCount: Number.isFinite(gridCount) ? Math.max(0, gridCount) : 0 };
    }

    const midpoint = lowerPrice.plus(upperPrice).div(2);
    const spacingPct = estimateEffectiveSpacingPct(config, midpoint);
    const risk = estimateGridRisk(config, toDecimalString(midpoint, 8));
    const notionalPerGrid = decimal(risk.autoOrderSize);
    const profitPerCycle = notionalPerGrid.mul(spacingPct).div(100);
    const worstCaseLoss = decimal(risk.bufferedLossToStop);
    const reward = decimal(risk.rewardToTakeProfit);
    const riskRewardRatio = worstCaseLoss.gt(0) ? reward.div(worstCaseLoss) : decimal(0);

    return {
      lineCount: gridCount,
      entryOrderCount: risk.entryOrderCount,
      autoOrderSize: risk.autoOrderSize,
      totalNotional: toDecimalString(totalNotional, 2),
      spacingPct: toDecimalString(spacingPct, 3),
      profitPerCycle: toDecimalString(profitPerCycle, 2),
      worstCaseLoss: toDecimalString(worstCaseLoss, 2),
      lossToStop: risk.lossToStop,
      stopBuffer: risk.stopBuffer,
      riskRewardRatio: `${toDecimalString(riskRewardRatio, 2)}x`,
      spacingStatus: spacingPct.gte("0.05") ? "ok" : "tight",
    };
  } catch {
    return {
      ...EMPTY_PREVIEW,
      lineCount: Number.isFinite(config.gridCount) ? Math.max(0, config.gridCount) : 0,
    };
  }
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
