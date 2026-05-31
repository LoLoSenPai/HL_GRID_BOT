import { decimal, toDecimalString } from "@/domain/decimal";
import { getMarketPriceDecimals } from "@/domain/markets";
import type { GridConfig, PositionSide } from "@/domain/types";

const RANGE_WIDTH_PCT = "0.08";
const STOP_BUFFER_PCT = "0.012";

export function deriveDefaultGridConfigFromPrice(config: GridConfig, markPrice?: string): GridConfig {
  if (!markPrice) return config;

  try {
    const mark = decimal(markPrice);
    if (!mark.gt(0)) return config;

    const lowerPrice = mark.mul(decimal(1).minus(RANGE_WIDTH_PCT));
    const upperPrice = mark.mul(decimal(1).plus(RANGE_WIDTH_PCT));
    const side = config.positionSide;
    const stopLoss =
      side === "long"
        ? lowerPrice.mul(decimal(1).minus(STOP_BUFFER_PCT))
        : upperPrice.mul(decimal(1).plus(STOP_BUFFER_PCT));
    const takeProfit = side === "long" ? upperPrice : lowerPrice;
    const places = getMarketPriceDecimals(config.pair);

    return {
      ...config,
      lowerPrice: toDecimalString(lowerPrice, places),
      upperPrice: toDecimalString(upperPrice, places),
      stopLoss: toDecimalString(stopLoss, places),
      takeProfit: toDecimalString(takeProfit, places),
    };
  } catch {
    return config;
  }
}

export function deriveDefaultGridConfigForSide(
  config: GridConfig,
  positionSide: PositionSide,
  markPrice?: string,
): GridConfig {
  return deriveDefaultGridConfigFromPrice({ ...config, positionSide }, markPrice);
}

export function deriveGridConfigForPositionSide(config: GridConfig, positionSide: PositionSide): GridConfig {
  try {
    const lowerPrice = decimal(config.lowerPrice);
    const upperPrice = decimal(config.upperPrice);
    if (!lowerPrice.gt(0) || !upperPrice.gt(lowerPrice)) return { ...config, positionSide };

    const stopLoss =
      positionSide === "long"
        ? lowerPrice.mul(decimal(1).minus(STOP_BUFFER_PCT))
        : upperPrice.mul(decimal(1).plus(STOP_BUFFER_PCT));
    const takeProfit = positionSide === "long" ? upperPrice : lowerPrice;
    const places = getMarketPriceDecimals(config.pair);

    return {
      ...config,
      positionSide,
      stopLoss: toDecimalString(stopLoss, places),
      takeProfit: toDecimalString(takeProfit, places),
    };
  } catch {
    return { ...config, positionSide };
  }
}
