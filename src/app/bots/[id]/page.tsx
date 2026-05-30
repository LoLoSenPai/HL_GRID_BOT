import { RefreshCw, Rocket } from "lucide-react";
import { notFound } from "next/navigation";

import { TerminalChart } from "@/components/charts/terminal-chart";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { MetricCard } from "@/components/trading/metric-card";
import { StatusBadge } from "@/components/trading/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createLiveCandidateAction,
  reconcilePaperRuntimeAction,
  simulateFillAction,
  startBotAction,
  stopBotAction,
} from "@/features/bots/actions";
import { getBot, getBotRuntimeState, getRuntimeMetrics, listEvents, listOrders } from "@/features/bots/repository";
import { getCandlesForConfig } from "@/features/market-data/service";

export const dynamic = "force-dynamic";

export default async function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bot = getBot(id);
  if (!bot) notFound();
  const metrics = getRuntimeMetrics();
  const events = listEvents(30, bot.id);
  const openOrders = listOrders(bot.id).filter((order) => order.status === "open");
  const runtimeState = getBotRuntimeState(bot.id);
  const candles = await getCandlesForConfig(bot.config);
  const isLiveCandidate = bot.config.mode === "propr_live";

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{bot.name}</h1>
          <p className="text-sm text-muted-foreground">{bot.config.pair}/USDC grid configuration and runtime state.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={bot.status} />
          <form action={startBotAction}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" disabled={isLiveCandidate}>Start</Button>
          </form>
          <form action={simulateFillAction}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" variant="outline" disabled={!openOrders.length}>
              Fill
            </Button>
          </form>
          <form action={reconcilePaperRuntimeAction}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" variant="outline">
              <RefreshCw />
              Reconcile
            </Button>
          </form>
          {!isLiveCandidate ? (
            <form action={createLiveCandidateAction}>
              <input type="hidden" name="id" value={bot.id} />
              <Button type="submit" variant="outline">
                <Rocket />
                Live candidate
              </Button>
            </form>
          ) : null}
          <form action={stopBotAction}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" variant="outline">Stop</Button>
          </form>
        </div>
      </div>
      {isLiveCandidate ? (
        <Alert variant="destructive">
          <Rocket className="size-4" />
          <AlertTitle>Live candidate only</AlertTitle>
          <AlertDescription>
            This bot uses the Propr live execution profile, but live start is disabled until guarded live runtime,
            reconciliation and kill switch controls are complete.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="PnL" value={`${Number(metrics.pnl) >= 0 ? "+" : ""}${metrics.pnl}`} />
        <MetricCard label="Exposure" value={metrics.exposure} />
        <MetricCard label="Drawdown" value={`${metrics.drawdownPct}%`} />
        <MetricCard label="Open orders" value={String(openOrders.length)} />
        <MetricCard label="Last mark" value={runtimeState?.lastPrice ?? "none"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Runtime chart</CardTitle>
          </CardHeader>
          <CardContent>
            <TerminalChart config={bot.config} candles={candles} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Bot events</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed events={events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
