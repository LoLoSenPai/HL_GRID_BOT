import { ShieldCheck, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/trading/simple-progress";
import type { RuntimeMetrics } from "@/domain/types";

export function RiskPanel({ metrics }: { metrics: RuntimeMetrics }) {
  const exposurePct = Math.min((Number(metrics.exposure) / 25000) * 100, 100);
  const drawdownPct = Math.min(Number(metrics.drawdownPct), 100);

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {drawdownPct > 8 ? <ShieldAlert className="size-4 text-destructive" /> : <ShieldCheck className="size-4 text-primary" />}
          Risk manager
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ProgressBar label="Global exposure" value={exposurePct} caption={`${metrics.exposure} / 25000 USDC`} />
        <ProgressBar label="Drawdown" value={drawdownPct} caption={`${metrics.drawdownPct}% / 12%`} />
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Live mode is unavailable until Propr auth, active challenge, leverage limits and explicit confirmation all pass.
        </div>
      </CardContent>
    </Card>
  );
}
