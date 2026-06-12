import { decimal, toDecimalString } from "@/domain/decimal";
import { autoOrderSizeUsd, generateGridLevels, reduceOnlyForGridSide } from "@/domain/grid";
import type { GridConfig } from "@/domain/types";

const DEFAULT_SL_BUFFER_PCT = "10";

export interface GridRiskEstimate {
  referencePrice: string;
  entryOrderCount: number;
  autoOrderSize: string;
  totalEntryNotional: string;
  lossToStop: string;
  bufferedLossToStop: string;
  stopBuffer: string;
  rewardToTakeProfit: string;
}

export function estimateGridRisk(
  config: GridConfig,
  referencePrice = midpoint(config),
  stopBufferPct = DEFAULT_SL_BUFFER_PCT,
): GridRiskEstimate {
  try {
    const levels = generateGridLevels(config, referencePrice);
    const entryLevels = levels.filter((level) => !reduceOnlyForGridSide(config.positionSide, level.side));
    const stopLoss = config.stopLoss ? decimal(config.stopLoss) : null;
    const takeProfit = config.takeProfit ? decimal(config.takeProfit) : null;

    const totalEntryNotional = entryLevels.reduce(
      (total, level) => total.plus(decimal(level.quantity).mul(level.price)),
      decimal(0),
    );
    const lossToStop = stopLoss
      ? entryLevels.reduce((total, level) => {
          const entry = decimal(level.price);
          const quantity = decimal(level.quantity);
          const unitLoss =
            config.positionSide === "long" ? entry.minus(stopLoss) : stopLoss.minus(entry);
          return unitLoss.gt(0) ? total.plus(quantity.mul(unitLoss)) : total;
        }, decimal(0))
      : decimal(0);
    const rewardToTakeProfit = takeProfit
      ? entryLevels.reduce((total, level) => {
          const entry = decimal(level.price);
          const quantity = decimal(level.quantity);
          const unitReward =
            config.positionSide === "long" ? takeProfit.minus(entry) : entry.minus(takeProfit);
          return unitReward.gt(0) ? total.plus(quantity.mul(unitReward)) : total;
        }, decimal(0))
      : decimal(0);
    const stopBuffer = lossToStop.mul(stopBufferPct).div(100);

    return {
      referencePrice,
      entryOrderCount: entryLevels.length,
      autoOrderSize: autoOrderSizeUsd(config, referencePrice),
      totalEntryNotional: toDecimalString(totalEntryNotional, 2),
      lossToStop: toDecimalString(lossToStop, 2),
      bufferedLossToStop: toDecimalString(lossToStop.plus(stopBuffer), 2),
      stopBuffer: toDecimalString(stopBuffer, 2),
      rewardToTakeProfit: toDecimalString(rewardToTakeProfit, 2),
    };
  } catch {
    return {
      referencePrice,
      entryOrderCount: 0,
      autoOrderSize: "0",
      totalEntryNotional: "0",
      lossToStop: "0",
      bufferedLossToStop: "0",
      stopBuffer: "0",
      rewardToTakeProfit: "0",
    };
  }
}

function midpoint(config: GridConfig): string {
  try {
    return toDecimalString(decimal(config.lowerPrice).plus(config.upperPrice).div(2), 8);
  } catch {
    return "0";
  }
}
