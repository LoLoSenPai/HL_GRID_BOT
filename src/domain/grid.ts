import { decimal, toDecimalString } from "@/domain/decimal";
import { getMarketQuantityDecimals } from "@/domain/markets";
import type { GridConfig, GridLevel, OrderSide, PositionSide } from "@/domain/types";

export function generateGridPrices(config: GridConfig): string[] {
  const lower = decimal(config.lowerPrice);
  const upper = decimal(config.upperPrice);

  if (config.gridCount < 2) {
    throw new Error("Grid count must be at least 2");
  }
  if (!lower.gt(0) || !upper.gt(lower)) {
    throw new Error("Grid range is invalid");
  }

  if (config.spacing === "geometric") {
    const ratio = upper.div(lower).pow(decimal(1).div(config.gridCount - 1));
    return Array.from({ length: config.gridCount }, (_, index) =>
      toDecimalString(lower.mul(ratio.pow(index)), 6),
    );
  }

  const step = upper.minus(lower).div(config.gridCount - 1);
  return Array.from({ length: config.gridCount }, (_, index) =>
    toDecimalString(lower.plus(step.mul(index)), 6),
  );
}

export function calculateOrderQuantity(
  asset: string,
  orderSizeUsd: string,
  price: string,
): string {
  const decimals = getMarketQuantityDecimals(asset);
  return toDecimalString(decimal(orderSizeUsd).div(price), decimals);
}

export function sideForLevel(price: string, referencePrice: string): OrderSide {
  return decimal(price).lte(referencePrice) ? "buy" : "sell";
}

export function reduceOnlyForGridSide(positionSide: PositionSide, orderSide: OrderSide): boolean {
  return positionSide === "long" ? orderSide === "sell" : orderSide === "buy";
}

export function autoOrderSizeUsd(config: GridConfig, referencePrice: string): string {
  const prices = generateGridPrices(config);
  void referencePrice;
  if (prices.length === 0) return "0";

  return toDecimalString(decimal(config.capitalAllocation).mul(config.leverage).div(prices.length), 2);
}

export function generateGridLevels(
  config: GridConfig,
  referencePrice: string,
): GridLevel[] {
  const orderSize = autoOrderSizeUsd(config, referencePrice);
  return generateGridPrices(config).map((price, index) => ({
    id: `${config.pair}-${index}-${price}`,
    index,
    price,
    side: sideForLevel(price, referencePrice),
    quantity: calculateOrderQuantity(config.pair, orderSize, price),
  }));
}

export function isOutOfRange(config: GridConfig, price: string): boolean {
  const px = decimal(price);
  return px.lt(config.lowerPrice) || px.gt(config.upperPrice);
}

export function estimateGridStepPct(config: GridConfig): string {
  const prices = generateGridPrices(config);
  if (prices.length < 2) return "0";
  const first = decimal(prices[0]);
  const second = decimal(prices[1]);
  return toDecimalString(second.minus(first).div(first).mul(100), 4);
}
