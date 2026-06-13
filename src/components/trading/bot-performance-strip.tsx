import { Activity, BarChart3, Clock3, DollarSign, Gauge, Layers3 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatMarketSymbol } from "@/domain/markets";
import type { BotPerformanceSummary } from "@/features/bots/performance";
import { cn } from "@/lib/utils";

export function BotPerformanceStrip({
  summary,
  variant = "card",
}: {
  summary: BotPerformanceSummary;
  variant?: "card" | "embedded";
}) {
  const content = (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-6">
        <div className="sm:col-span-2 2xl:col-span-1">
          <div className="text-xs text-muted-foreground">Active bot</div>
          <div className="mt-1 truncate font-semibold" title={summary.bot.name}>
            {summary.bot.name}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMarketSymbol(summary.bot.config.pair)} / {summary.bot.config.positionSide.toUpperCase()} /{" "}
            {summary.bot.config.leverage}x
          </div>
        </div>
        <BotMetric icon={DollarSign} label="Tracked PnL" value={`${signed(summary.trackedPnl)} USDC`} tone={tone(summary.trackedPnl)} />
        <BotMetric icon={Gauge} label="Return" value={`${signed(summary.trackedPnlPct)}%`} tone={tone(summary.trackedPnlPct)} />
        <BotMetric icon={Layers3} label="Orders" value={`${summary.openOrders} open`} detail={`${summary.filledOrders} filled`} />
        <BotMetric icon={BarChart3} label="Exposure" value={`${summary.exposure} USDC`} detail={`${summary.volume} volume`} />
        <BotMetric icon={Clock3} label="State" value={summary.stateLabel} detail={summary.lastFillAt ? `Last fill ${relativeTime(summary.lastFillAt)}` : "No fill yet"} />
      </div>
  );

  if (variant === "embedded") return content;

  return (
    <Card className="rounded-lg">
      <CardContent className="p-3">{content}</CardContent>
    </Card>
  );
}

function BotMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "metric-mono mt-2 font-semibold capitalize",
          tone === "positive" && "text-primary",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function signed(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric >= 0 ? "+" : ""}${value}`;
}

function tone(value: string) {
  const numeric = Number(value);
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return undefined;
}

function relativeTime(value: string): string {
  const diffMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(diffMs)) return "unknown";
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
