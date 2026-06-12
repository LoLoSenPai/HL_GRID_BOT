import { ShieldCheck, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/trading/simple-progress";
import type { RuntimeMetrics } from "@/domain/types";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";

export function RiskPanel({
  metrics,
  challenge,
}: {
  metrics: RuntimeMetrics;
  challenge?: ProprChallengeSummary;
}) {
  const exposureCap = Math.max(1, Number(challenge?.equity ?? metrics.equity) * 5);
  const exposurePct = Math.min((Number(metrics.exposure) / exposureCap) * 100, 100);
  const dailyLossPct = Math.min(Number(challenge?.dailyLossUsedPct ?? "0"), 100);
  const drawdownPct = Math.min(Number(challenge?.drawdownUsedPct ?? metrics.drawdownPct), 100);
  const isRiskElevated = dailyLossPct > 75 || drawdownPct > 75;

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {isRiskElevated ? (
            <ShieldAlert className="size-4 text-destructive" />
          ) : (
            <ShieldCheck className="size-4 text-primary" />
          )}
          Risk manager
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ProgressBar
          label="Open exposure"
          value={exposurePct}
          caption={`${metrics.exposure} / ${exposureCap.toFixed(0)} USDC`}
        />
        {challenge ? (
          <>
            <ProgressBar
              label="Daily loss"
              value={dailyLossPct}
              caption={`${challenge.dailyLossUsedPct}% / ${challenge.dailyLossLimit} USDC`}
            />
            <ProgressBar
              label="Drawdown"
              value={drawdownPct}
              caption={`${challenge.drawdownUsedPct}% / floor ${challenge.drawdownLimit}`}
            />
          </>
        ) : (
          <ProgressBar label="Drawdown" value={drawdownPct} caption={`${metrics.drawdownPct}%`} />
        )}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          {challenge?.source === "propr_live"
            ? "Challenge deployment is gated by Propr sync, leverage caps, explicit confirmation and preflight risk."
            : "Propr sync is unavailable; challenge deployment stays blocked until readiness passes."}
        </div>
      </CardContent>
    </Card>
  );
}
