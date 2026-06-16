import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decimal, toDecimalString } from "@/domain/decimal";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { cn } from "@/lib/utils";

export function ChallengePanel({ challenge }: { challenge: ProprChallengeSummary }) {
  const dailySafety = dailySafetyStop(challenge);
  const netPnl = challengeNetPnl(challenge);

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Propr challenge</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {challenge.label} - Live API
            </div>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              challenge.source === "propr_live"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-amber-300/30 bg-amber-300/10 text-amber-100",
            )}
          >
            {challenge.source === "propr_live" ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {challenge.source === "propr_live" ? "Synced" : "Fallback"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <ChallengeMetric label="Equity" value={`${challenge.equity} USDC`} detail={`Balance ${challenge.balance}`} />
          <ChallengeMetric label="Profit target" value={`${challenge.profitProgressPct}%`} detail={`${netPnl} / ${challenge.profitTarget} USDC`} />
          <ChallengeMetric label="Available" value={`${challenge.availableBalance ?? "n/a"} USDC`} detail={challenge.accountId ? `Account ${challenge.accountId}` : "No account synced"} />
        </div>

        <div
          className={cn(
            "rounded-lg border p-3",
            dailySafety.status === "safe" && "border-primary/30 bg-primary/10",
            dailySafety.status === "warning" && "border-amber-300/30 bg-amber-300/10",
            dailySafety.status === "stop" && "border-destructive/30 bg-destructive/10",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Daily safety stop</div>
              <div className="mt-1 metric-mono text-xl font-semibold">{dailySafety.status.toUpperCase()}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <SafetyMetric label="Equity" value={`${challenge.equity} USDC`} />
              <SafetyMetric label="Floor 2.75%" value={`${dailySafety.floor} USDC`} />
              <SafetyMetric label="Distance" value={`${dailySafety.remaining} USDC`} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ChallengeProgress
            label="Objective"
            value={challenge.profitProgressPct}
            detail={`${challenge.ruleSet.profitTargetPct}% target, equity vs initial balance`}
            tone="primary"
          />
          <ChallengeProgress
            label="Daily loss"
            value={challenge.dailyLossUsedPct}
            detail={`${challenge.dailyLossLimit} USDC limit from ${challenge.dayStartEquity}`}
            tone={Number(challenge.dailyLossUsedPct) >= 75 ? "destructive" : "default"}
          />
          <ChallengeProgress
            label="Drawdown"
            value={challenge.drawdownUsedPct}
            detail={`${challenge.drawdownLimit} USDC floor, ${challenge.ruleSet.drawdownMode}`}
            tone={Number(challenge.drawdownUsedPct) >= 75 ? "destructive" : "default"}
          />
        </div>

        {challenge.warning ? (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100/80">
            {challenge.warning}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SafetyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] rounded-md border bg-background/50 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="metric-mono mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function dailySafetyStop(challenge: ProprChallengeSummary): {
  floor: string;
  remaining: string;
  usedPct: string;
  status: "safe" | "warning" | "stop";
} {
  const stopAmount = decimal(challenge.startingBalance).mul("2.75").div(100);
  const floor = decimal(challenge.dayStartEquity).minus(stopAmount);
  const remaining = decimal(challenge.equity).minus(floor);
  const used = decimal(challenge.dailyLossUsed);
  const usedPct = stopAmount.gt(0) ? used.div(stopAmount).mul(100) : decimal(0);

  return {
    floor: toDecimalString(floor, 2),
    remaining: toDecimalString(remaining, 2),
    usedPct: toDecimalString(usedPct, 1),
    status: remaining.lte(0) ? "stop" : usedPct.gte(80) ? "warning" : "safe",
  };
}

function challengeNetPnl(challenge: ProprChallengeSummary): string {
  try {
    return toDecimalString(decimal(challenge.equity).minus(challenge.startingBalance), 2);
  } catch {
    return "0";
  }
}

function ChallengeMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="metric-mono mt-2 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function ChallengeProgress({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "destructive" | "default";
}) {
  const numericValue = Math.min(100, Math.max(0, Number(value) || 0));

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            "metric-mono text-sm font-semibold",
            tone === "primary" && "text-primary",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}%
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "primary" && "bg-primary",
            tone === "destructive" && "bg-destructive",
            tone === "default" && "bg-chart-2",
          )}
          style={{ width: `${numericValue}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
