import { Beaker, Calculator } from "lucide-react";

import { TerminalChart } from "@/components/charts/terminal-chart";
import { MetricCard } from "@/components/trading/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateGridStepPct, generateGridLevels } from "@/domain/grid";
import { defaultBotConfig } from "@/features/bots/sample-data";

export default function LabPage() {
  const levels = generateGridLevels(defaultBotConfig, "100000");
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Lab</h1>
        <p className="text-sm text-muted-foreground">Simulate grids, compare spacing and estimate fees.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Levels" value={String(levels.length)} detail="Generated from BTC range" />
        <MetricCard label="Step" value={`${estimateGridStepPct(defaultBotConfig)}%`} detail="Arithmetic spacing" />
        <MetricCard label="Order size" value={`${defaultBotConfig.orderSize} USDC`} detail="Per level" />
        <MetricCard label="Capital" value={`${defaultBotConfig.capitalAllocation} USDC`} detail="Allocated" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Beaker className="size-4 text-primary" />
              Grid simulator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TerminalChart config={defaultBotConfig} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calculator className="size-4 text-primary" />
              Spacing comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {levels.slice(0, 8).map((level) => (
              <div key={level.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-sm">
                <span className="metric-mono">{level.price}</span>
                <span className={level.side === "buy" ? "text-primary" : "text-amber-200"}>{level.side}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
