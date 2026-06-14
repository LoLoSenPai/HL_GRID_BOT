import { Decimal, decimal, toDecimalString } from "@/domain/decimal";
import {
  computeDailyLossLimit,
  computeDrawdownLimit,
  computeProfitTarget,
  PROPR_CLASSIC_1_STEP_RULES,
  PROPR_CLASSIC_2_STEP_RULES,
  type ProprChallengeRuleSet,
} from "@/domain/propr-rules";
import type { RuntimeMetrics } from "@/domain/types";
import { createProprClient, type ProprAccount, type ProprChallengeAttempt } from "@/features/propr/client";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface ProprChallengeSummary {
  source: "propr_live" | "local_fallback";
  checkedAt: string;
  accountId?: string;
  attemptId?: string;
  status: "active" | "unavailable";
  label: string;
  ruleSet: ProprChallengeRuleSet;
  startingBalance: string;
  balance: string;
  equity: string;
  realizedPnl: string;
  unrealizedPnl: string;
  availableBalance?: string;
  profitTarget: string;
  profitProgressPct: string;
  dailyLossLimit: string;
  dayStartEquity: string;
  dailyLossUsedPct: string;
  drawdownLimit: string;
  drawdownUsedPct: string;
  highWaterMark: string;
  warning?: string;
}

export async function getProprChallengeSummary(metrics: RuntimeMetrics): Promise<ProprChallengeSummary> {
  const env = getEnv();

  if (!env.PROPR_API_KEY) {
    return localFallbackSummary(metrics, "Propr API key is not configured.");
  }

  try {
    const client = createProprClient();
    const attempts = await client.getChallengeAttempts({ status: "active" });
    if (!attempts[0]?.accountId) {
      return localFallbackSummary(metrics, "No active Propr challenge account found.");
    }

    const accountId = await client.setup();
    const attempt = attempts.find((activeAttempt) => activeAttempt.accountId === accountId) ?? attempts[0];
    const [account, detailedAttempt] = await Promise.all([
      client.getAccount(),
      attempt.attemptId ? client.getChallengeAttempt(attempt.attemptId).catch(() => attempt) : Promise.resolve(attempt),
    ]);

    return buildSummaryFromPropr(account, detailedAttempt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Propr challenge error";
    logger.warn("propr.challenge_summary_fallback", { error: message });
    return localFallbackSummary(metrics, message);
  }
}

function buildSummaryFromPropr(
  account: ProprAccount,
  attempt: ProprChallengeAttempt,
): ProprChallengeSummary {
  const ruleSet = inferRuleSet(attempt);
  const startingBalance = pickString(attempt.currentPhase?.startingBalance, attempt.phases?.[0]?.startingBalance, "5000");
  const balance = pickString(account.balance, startingBalance);
  const unrealizedPnl = pickString(account.totalUnrealizedPnl, "0");
  const equity = pickString(
    account.equity,
    account.marginBalance,
    decimal(balance).plus(unrealizedPnl).plus(account.isolatedPositionMargin ?? "0").toString(),
  );
  const highWaterMark = pickString(account.highWaterMark, Decimal.max(equity, startingBalance).toString());
  const dayStartEquity = pickString(account.dayStartEquity, account.dailyStartEquity, account.startOfDayEquity, startingBalance);
  const realizedPnl = pickString(
    attempt.totalPnl,
    attempt.totalProfitLoss,
    attempt.pnl,
    decimal(balance).minus(startingBalance).toString(),
  );

  return buildSummary({
    source: "propr_live",
    accountId: redactIdentifier(account.accountId ?? attempt.accountId),
    attemptId: redactIdentifier(attempt.attemptId),
    label: `${ruleSet.label} challenge`,
    ruleSet,
    startingBalance,
    balance,
    equity,
    realizedPnl,
    unrealizedPnl,
    availableBalance: account.availableBalance,
    dayStartEquity,
    highWaterMark,
  });
}

function localFallbackSummary(
  _metrics: RuntimeMetrics,
  warning: string,
): ProprChallengeSummary {
  const startingBalance = "5000";
  const equity = startingBalance;
  const balance = startingBalance;

  return buildSummary({
    source: "local_fallback",
    label: "Classic 1-Step challenge",
    ruleSet: PROPR_CLASSIC_1_STEP_RULES,
    startingBalance,
    balance,
    equity,
    realizedPnl: "0",
    unrealizedPnl: "0",
    dayStartEquity: equity,
    highWaterMark: Decimal.max(equity, startingBalance).toString(),
    warning,
  });
}

function buildSummary(input: {
  source: "propr_live" | "local_fallback";
  accountId?: string;
  attemptId?: string;
  label: string;
  ruleSet: ProprChallengeRuleSet;
  startingBalance: string;
  balance: string;
  equity: string;
  realizedPnl: string;
  unrealizedPnl: string;
  availableBalance?: string;
  dayStartEquity: string;
  highWaterMark: string;
  warning?: string;
}): ProprChallengeSummary {
  const profitTarget = computeProfitTarget(input.startingBalance, input.ruleSet);
  const dailyLossLimit = computeDailyLossLimit(input.startingBalance, input.ruleSet);
  const drawdownLimit = computeDrawdownLimit(input.startingBalance, input.highWaterMark, input.ruleSet);

  return {
    source: input.source,
    checkedAt: new Date().toISOString(),
    accountId: input.accountId,
    attemptId: input.attemptId,
    status: input.source === "propr_live" ? "active" : "unavailable",
    label: input.label,
    ruleSet: input.ruleSet,
    startingBalance: formatUsd(input.startingBalance),
    balance: formatUsd(input.balance),
    equity: formatUsd(input.equity),
    realizedPnl: formatUsd(input.realizedPnl),
    unrealizedPnl: formatUsd(input.unrealizedPnl),
    availableBalance: input.availableBalance ? formatUsd(input.availableBalance) : undefined,
    profitTarget: formatUsd(profitTarget),
    profitProgressPct: signedPct(decimal(input.equity).minus(input.startingBalance), input.startingBalance),
    dailyLossLimit: formatUsd(dailyLossLimit),
    dayStartEquity: formatUsd(input.dayStartEquity),
    dailyLossUsedPct: boundedPct(Decimal.max(0, decimal(input.dayStartEquity).minus(input.equity)), dailyLossLimit),
    drawdownLimit: formatUsd(drawdownLimit),
    drawdownUsedPct: boundedPct(
      Decimal.max(0, decimal(input.highWaterMark).minus(input.equity)),
      decimal(input.highWaterMark).minus(drawdownLimit).toString(),
    ),
    highWaterMark: formatUsd(input.highWaterMark),
    warning: input.warning,
  };
}

function inferRuleSet(attempt: ProprChallengeAttempt): ProprChallengeRuleSet {
  const phaseCount = attempt.phases?.length ?? 0;
  return phaseCount > 1 ? PROPR_CLASSIC_2_STEP_RULES : PROPR_CLASSIC_1_STEP_RULES;
}

function boundedPct(value: ReturnType<typeof decimal>, denominator: string): string {
  const base = decimal(denominator);
  if (!base.gt(0)) return "0";
  return toDecimalString(Decimal.min(100, Decimal.max(0, value.div(base).mul(100))), 1);
}

function signedPct(value: ReturnType<typeof decimal>, denominator: string): string {
  const base = decimal(denominator);
  if (!base.gt(0)) return "0";
  return toDecimalString(value.div(base).mul(100), 2);
}

function formatUsd(value: string): string {
  return toDecimalString(value, 2);
}

function pickString(...values: Array<string | null | undefined>): string {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? "0";
}

function redactIdentifier(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.length <= 18) return value;
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}
