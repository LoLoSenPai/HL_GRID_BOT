import { Decimal, decimal, toDecimalString } from "@/domain/decimal";
import type { GridConfig, PositionSide } from "@/domain/types";
import type { Candle } from "@/features/market-data/types";

const DEFAULT_RISK_PCT = "1";
const DEFAULT_ROUND_TRIP_FEE_PCT = "0.03";
const DEFAULT_ATR_PERIOD = 14;
const MIN_GRID_ORDERS = 2;
const MAX_GRID_ORDERS = 1000;

export interface PerpGridSizingInput {
  totalCapital: string;
  riskPct?: string;
  positionSide: PositionSide;
  lowerPrice: string;
  upperPrice: string;
  stopPrice?: string;
  leverage: number;
  roundTripFeePct?: string;
  atrLocal?: string;
}

export interface PerpGridSizingEstimate {
  riskPct: string;
  riskDollars: string;
  averageGridPrice: string;
  drawdownToStopPct: string;
  riskSizedNotional: string;
  marginRequired: string;
  rangePct: string;
  feeSpacingMinPct: string;
  atrSpacingMinPct: string;
  spacingMinPct: string;
  recommendedGridOrders: number;
}

export function estimatePerpGridSizing(input: PerpGridSizingInput): PerpGridSizingEstimate {
  const riskPct = safePositive(input.riskPct, DEFAULT_RISK_PCT);
  const totalCapital = safePositive(input.totalCapital, "0");
  const lower = safePositive(input.lowerPrice, "0");
  const upper = safePositive(input.upperPrice, "0");
  const leverage = decimal(input.leverage || 1);
  const averageGridPrice = lower.gt(0) && upper.gt(lower) ? lower.plus(upper).div(2) : decimal(0);
  const stopPrice = input.stopPrice ? safePositive(input.stopPrice, "0") : decimal(0);
  const drawdownToStopPct =
    averageGridPrice.gt(0) && stopPrice.gt(0)
      ? input.positionSide === "long"
        ? averageGridPrice.minus(stopPrice).div(averageGridPrice).mul(100)
        : stopPrice.minus(averageGridPrice).div(averageGridPrice).mul(100)
      : decimal(0);
  const riskDollars = totalCapital.mul(riskPct).div(100);
  const riskSizedNotional = drawdownToStopPct.gt(0) ? riskDollars.div(drawdownToStopPct.div(100)) : decimal(0);
  const marginRequired = leverage.gt(0) ? riskSizedNotional.div(leverage) : decimal(0);
  const rangePct = averageGridPrice.gt(0) && upper.gt(lower) ? upper.minus(lower).div(averageGridPrice).mul(100) : decimal(0);
  const feeSpacingMinPct = safePositive(input.roundTripFeePct, DEFAULT_ROUND_TRIP_FEE_PCT).mul(4);
  const atrSpacingMinPct =
    input.atrLocal && averageGridPrice.gt(0)
      ? safePositive(input.atrLocal, "0").div(averageGridPrice).mul(100).mul("0.5")
      : decimal(0);
  const spacingMinPct = Decimal.max(feeSpacingMinPct, atrSpacingMinPct);
  const recommendedGridOrders =
    rangePct.gt(0) && spacingMinPct.gt(0)
      ? clampGridOrders(Math.floor(rangePct.div(spacingMinPct).toNumber()))
      : MIN_GRID_ORDERS;

  return {
    riskPct: toDecimalString(riskPct, 2),
    riskDollars: toDecimalString(riskDollars, 2),
    averageGridPrice: toDecimalString(averageGridPrice, 8),
    drawdownToStopPct: toDecimalString(Decimal.max(drawdownToStopPct, 0), 4),
    riskSizedNotional: toDecimalString(riskSizedNotional, 2),
    marginRequired: toDecimalString(marginRequired, 2),
    rangePct: toDecimalString(rangePct, 4),
    feeSpacingMinPct: toDecimalString(feeSpacingMinPct, 4),
    atrSpacingMinPct: toDecimalString(atrSpacingMinPct, 4),
    spacingMinPct: toDecimalString(spacingMinPct, 4),
    recommendedGridOrders,
  };
}

export function estimatePerpGridSizingFromConfig(
  config: GridConfig,
  totalCapital: string,
  candles: Candle[] = [],
  riskPct = DEFAULT_RISK_PCT,
): PerpGridSizingEstimate {
  return estimatePerpGridSizing({
    totalCapital,
    riskPct,
    positionSide: config.positionSide,
    lowerPrice: config.lowerPrice,
    upperPrice: config.upperPrice,
    stopPrice: config.stopLoss,
    leverage: config.leverage,
    atrLocal: estimateAtr(candles),
  });
}

export function estimateAtr(candles: Candle[], period = DEFAULT_ATR_PERIOD): string {
  const slice = candles.slice(-period - 1);
  if (slice.length < 2) return "0";

  const trueRanges = slice.slice(1).map((candle, index) => {
    const previousClose = decimal(slice[index].close);
    const high = decimal(candle.high);
    const low = decimal(candle.low);
    return Decimal.max(high.minus(low), high.minus(previousClose).abs(), low.minus(previousClose).abs());
  });
  const atr = trueRanges.reduce((total, item) => total.plus(item), decimal(0)).div(trueRanges.length);
  return toDecimalString(atr, 8);
}

function safePositive(value: string | number | undefined, fallback: string) {
  try {
    const next = decimal(value ?? fallback);
    return next.gt(0) ? next : decimal(fallback);
  } catch {
    return decimal(fallback);
  }
}

function clampGridOrders(value: number) {
  if (!Number.isFinite(value)) return MIN_GRID_ORDERS;
  return Math.max(MIN_GRID_ORDERS, Math.min(MAX_GRID_ORDERS, value));
}
