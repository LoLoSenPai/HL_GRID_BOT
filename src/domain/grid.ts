import { decimal, toDecimalString } from "@/domain/decimal";
import type { GridConfig, GridLevel, OrderSide } from "@/domain/types";

const ASSET_DECIMALS: Record<string, number> = {
  BTC: 6,
  ETH: 5,
  SOL: 4,
  HYPE: 4,
};

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
  const decimals = ASSET_DECIMALS[asset] ?? 4;
  return toDecimalString(decimal(orderSizeUsd).div(price), decimals);
}

export function sideForLevel(price: string, referencePrice: string): OrderSide {
  return decimal(price).lte(referencePrice) ? "buy" : "sell";
}

export function generateGridLevels(
  config: GridConfig,
  referencePrice: string,
): GridLevel[] {
  return generateGridPrices(config).map((price, index) => ({
    id: `${config.pair}-${index}-${price}`,
    index,
    price,
    side: sideForLevel(price, referencePrice),
    quantity: calculateOrderQuantity(config.pair, config.orderSize, price),
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
