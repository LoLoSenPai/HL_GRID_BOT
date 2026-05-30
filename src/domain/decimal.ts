import Decimal from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

export function decimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function toDecimalString(value: Decimal.Value, decimalPlaces = 8): string {
  const fixed = decimal(value).toDecimalPlaces(decimalPlaces).toFixed();
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function isPositiveDecimal(value: string): boolean {
  try {
    return decimal(value).gt(0);
  } catch {
    return false;
  }
}

export function clampDecimal(
  value: Decimal.Value,
  min: Decimal.Value,
  max: Decimal.Value,
): Decimal {
  return Decimal.min(Decimal.max(decimal(value), decimal(min)), decimal(max));
}

export function pct(numerator: Decimal.Value, denominator: Decimal.Value): string {
  const base = decimal(denominator);
  if (base.eq(0)) return "0";
  return toDecimalString(decimal(numerator).div(base).mul(100), 4);
}
