import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { cn } from "@/lib/utils";

export function ChallengePanel({ challenge }: { challenge: ProprChallengeSummary }) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Propr challenge</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {challenge.label} - {challenge.activeEnv === "live" ? "Live API" : "Beta API"}
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
          <ChallengeMetric label="Profit target" value={`${challenge.profitProgressPct}%`} detail={`${challenge.realizedPnl} / ${challenge.profitTarget} USDC`} />
          <ChallengeMetric label="Available" value={`${challenge.availableBalance ?? "n/a"} USDC`} detail={challenge.accountId ? `Account ${challenge.accountId}` : "No account synced"} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ChallengeProgress
            label="Objective"
            value={challenge.profitProgressPct}
            detail={`${challenge.ruleSet.profitTargetPct}% target, closed PnL only`}
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
