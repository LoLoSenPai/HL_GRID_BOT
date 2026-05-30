import { decimal, isPositiveDecimal } from "@/domain/decimal";
import { isOutOfRange } from "@/domain/grid";
import type { GridConfig, MarketSymbol, RuntimeMetrics } from "@/domain/types";

export interface RiskIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export interface RiskLimits {
  maxGlobalExposureUsd: string;
  maxBotDrawdownPct: string;
  minOrderUsd: string;
  leverageLimits: Record<string, number>;
  defaultMaxLeverage: number;
}

export interface OrderRiskIntent {
  asset: MarketSymbol;
  notionalUsd: string;
  leverage: number;
  reduceOnly?: boolean;
}

export interface RuntimeRiskInput {
  config: GridConfig;
  markPrice: string;
  metrics: RuntimeMetrics;
  globalExposureUsd: string;
  killSwitchActive: boolean;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxGlobalExposureUsd: "25000",
  maxBotDrawdownPct: "12",
  minOrderUsd: "10",
  leverageLimits: {
    BTC: 5,
    ETH: 5,
    SOL: 2,
    HYPE: 2,
  },
  defaultMaxLeverage: 2,
};

export function maxLeverageForAsset(
  asset: string,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): number {
  return limits.leverageLimits[asset] ?? limits.defaultMaxLeverage;
}

export function validateBotConfig(
  config: GridConfig,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskIssue[] {
  const issues: RiskIssue[] = [];
  const maxLeverage = maxLeverageForAsset(config.pair, limits);

  if (!isPositiveDecimal(config.lowerPrice) || !isPositiveDecimal(config.upperPrice)) {
    issues.push({
      code: "invalid_range",
      severity: "error",
      message: "Lower and upper prices must be positive decimals.",
    });
  } else if (decimal(config.upperPrice).lte(config.lowerPrice)) {
    issues.push({
      code: "inverted_range",
      severity: "error",
      message: "Upper price must be greater than lower price.",
    });
  }

  if (config.gridCount < 2 || config.gridCount > 100) {
    issues.push({
      code: "grid_count",
      severity: "error",
      message: "Grid count must be between 2 and 100.",
    });
  }

  if (!isPositiveDecimal(config.capitalAllocation)) {
    issues.push({
      code: "capital_allocation",
      severity: "error",
      message: "Capital allocation must be positive.",
    });
  }

  if (!isPositiveDecimal(config.orderSize) || decimal(config.orderSize).lt(limits.minOrderUsd)) {
    issues.push({
      code: "min_order_size",
      severity: "error",
      message: `Order size must be at least ${limits.minOrderUsd} USDC.`,
    });
  }

  if (config.leverage < 1 || config.leverage > maxLeverage) {
    issues.push({
      code: "leverage_limit",
      severity: "error",
      message: `${config.pair} leverage must be between 1x and ${maxLeverage}x.`,
    });
  }

  if (!isPositiveDecimal(config.maxDrawdownPct) || decimal(config.maxDrawdownPct).gt(50)) {
    issues.push({
      code: "drawdown_limit",
      severity: "error",
      message: "Max drawdown must be positive and no greater than 50%.",
    });
  }

  if (config.autoRecenter) {
    issues.push({
      code: "auto_recenter",
      severity: "warning",
      message: "Auto recenter is experimental and should remain disabled for live mode.",
    });
  }

  return issues;
}

export function validateOrderIntent(
  intent: OrderRiskIntent,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskIssue[] {
  const issues: RiskIssue[] = [];
  const maxLeverage = maxLeverageForAsset(intent.asset, limits);

  if (!intent.reduceOnly && decimal(intent.notionalUsd).lt(limits.minOrderUsd)) {
    issues.push({
      code: "min_notional",
      severity: "error",
      message: `Order notional must be at least ${limits.minOrderUsd} USDC.`,
    });
  }

  if (intent.leverage < 1 || intent.leverage > maxLeverage) {
    issues.push({
      code: "order_leverage",
      severity: "error",
      message: `Order leverage exceeds ${intent.asset} limit of ${maxLeverage}x.`,
    });
  }

  return issues;
}

export function evaluateRuntimeRisk(
  input: RuntimeRiskInput,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskIssue[] {
  const issues: RiskIssue[] = [];

  if (input.killSwitchActive) {
    issues.push({
      code: "kill_switch",
      severity: "error",
      message: "Global kill switch is active.",
    });
  }

  if (input.config.autoPauseOutOfRange && isOutOfRange(input.config, input.markPrice)) {
    issues.push({
      code: "out_of_range",
      severity: "error",
      message: "Current price is outside the configured grid range.",
    });
  }

  if (decimal(input.metrics.drawdownPct).gte(input.config.maxDrawdownPct)) {
    issues.push({
      code: "bot_drawdown",
      severity: "error",
      message: "Bot drawdown limit has been reached.",
    });
  }

  if (decimal(input.globalExposureUsd).gt(limits.maxGlobalExposureUsd)) {
    issues.push({
      code: "global_exposure",
      severity: "error",
      message: "Global exposure limit has been exceeded.",
    });
  }

  return issues;
}

export function shouldBlockLiveMode(issues: RiskIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
