import { RefreshCw } from "lucide-react";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ReactiveTerminalChart } from "@/components/charts/reactive-terminal-chart";
import { BotPerformanceStrip } from "@/components/trading/bot-performance-strip";
import { GridConfigPanel } from "@/components/trading/grid-config-panel";
import { LiveAccountStatePanel, LiveAccountStatePrefetch } from "@/components/trading/live-account-state-panel";
import { PnlBreakdownPanel } from "@/components/trading/pnl-breakdown-panel";
import { ReactiveTerminalMetrics } from "@/components/trading/reactive-terminal-metrics";
import { StatusBadge } from "@/components/trading/status-badge";
import { SyncStatusPanel } from "@/components/trading/sync-status-panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decimal, toDecimalString } from "@/domain/decimal";
import { deriveDefaultGridConfigFromPrice } from "@/domain/grid-defaults";
import { formatMarketPair, formatMarketSymbol } from "@/domain/markets";
import { reconcilePaperRuntimeAction, reconcileProprRuntimeAction } from "@/features/bots/actions";
import { getBotPerformance, type BotPerformanceSummary } from "@/features/bots/performance";
import {
  getBotRuntimeState,
  getRuntimeMetrics,
  listBots,
  listEvents,
  listFills,
  listOrders,
  type PersistedFill,
  type PersistedOrder,
} from "@/features/bots/repository";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { getCandlesForConfig, getMarketSnapshots } from "@/features/market-data/service";
import { getProprChallengeSummary, type ProprChallengeSummary } from "@/features/propr/challenge-summary";
import type { Bot } from "@/domain/types";

export const dynamic = "force-dynamic";

export default async function GridTerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ botId?: string | string[] | undefined }>;
}) {
  const bots = listBots();
  const params = await searchParams;
  const requestedBotId = Array.isArray(params.botId) ? params.botId[0] : params.botId;
  const requestedBot = requestedBotId ? bots.find((bot) => bot.id === requestedBotId) : undefined;
  const activeBot =
    requestedBot ?? bots.find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status)) ?? bots[0];
  const baseConfig = activeBot?.config ?? defaultBotConfig;
  const metrics = getRuntimeMetrics();
  const events = activeBot ? listEvents(20, activeBot.id) : [];
  const orders = activeBot ? listOrders(activeBot.id) : [];
  const fills = activeBot ? listFills(activeBot.id) : [];
  const runtimeState = activeBot ? getBotRuntimeState(activeBot.id) : null;
  const isChallengeBot = activeBot?.config.mode === "propr_live";
  const activeBotPerformance = activeBot ? getBotPerformance(activeBot) : null;
  const activeChallengeBot =
    activeBot && isChallengeBot && ["live", "running", "out_of_range"].includes(activeBot.status)
      ? {
          name: activeBot.name,
          status: activeBot.status,
          pair: activeBot.config.pair,
          openOrders: orders.filter((order) => order.status === "open").length,
        }
      : null;
  const [markets, challenge] = await Promise.all([getMarketSnapshots(), getProprChallengeSummary(metrics)]);
  const market = markets.find((snapshot) => snapshot.asset === baseConfig.pair) ?? {
    asset: baseConfig.pair,
    mid: "0",
    funding: "0",
    timestamp: 0,
  };
  const config = activeBot?.config ?? deriveDefaultGridConfigFromPrice(baseConfig, market.mid);
  const candles = await getCandlesForConfig(config);
  const chartOrders = orders
    .filter((order) => order.asset === config.pair && order.price)
    .map((order) => ({
      id: order.id,
      side: order.side,
      status: order.status,
      quantity: order.quantity,
      price: order.price,
      reduceOnly: Boolean(order.reduce_only),
    }));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-normal">Futures Grid</h1>
              <StatusBadge status={activeBot?.status ?? "draft"} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatMarketPair(config.pair)} perp / {config.positionSide.toUpperCase()} / Propr challenge
            </div>
          </div>
          <ReactiveTerminalMetrics initialPair={config.pair} markets={markets} challenge={challenge} />
        </div>
        <BotSwitcher bots={bots} activeBotId={activeBot?.id} />
      </div>
      <ChallengeTicker challenge={challenge} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_300px] overflow-hidden lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">Chart</span>
              <span className="text-muted-foreground">1h candles / grid levels / SL / TP</span>
            </div>
            <div className="text-muted-foreground">
              Runtime mark:{" "}
              <span className="metric-mono text-foreground">{runtimeState?.lastPrice ?? market.mid ?? "not synced"}</span>
            </div>
          </div>

          <section className="min-h-0 overflow-hidden p-3">
            <ReactiveTerminalChart initialConfig={config} candles={candles} orders={chartOrders} className="h-full" />
          </section>

          <section className="min-h-0 border-t bg-muted/10">
            <LiveAccountStatePrefetch />
            <Tabs defaultValue="overview" className="h-full gap-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <TabsList variant="line" className="h-8 rounded-none p-0">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="open-orders">Open Orders</TabsTrigger>
                  <TabsTrigger value="trades">Trade History</TabsTrigger>
                  <TabsTrigger value="funding">Funding</TabsTrigger>
                  <TabsTrigger value="local-orders">Local Orders</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="health">Health</TabsTrigger>
                </TabsList>
                {activeBot ? (
                  <form action={isChallengeBot ? reconcileProprRuntimeAction : reconcilePaperRuntimeAction}>
                    <input type="hidden" name="id" value={activeBot.id} />
                    <Button type="submit" size="sm" variant="outline">
                      <RefreshCw />
                      {isChallengeBot ? "Sync Propr" : "Reconcile"}
                    </Button>
                  </form>
                ) : null}
              </div>

              <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto p-3">
                {activeBotPerformance ? (
                  <BotOverview summary={activeBotPerformance} runtimeMark={runtimeState?.lastPrice ?? market.mid} />
                ) : (
                  <EmptyState title="No active bot" detail="Create a grid from the configuration panel to track performance here." />
                )}
              </TabsContent>

              <TabsContent value="positions" className="min-h-0 flex-1 overflow-auto p-3">
                <LiveAccountStatePanel variant="embedded" view="positions" activeAsset={config.pair} />
              </TabsContent>

              <TabsContent value="open-orders" className="min-h-0 flex-1 overflow-auto p-3">
                <LiveAccountStatePanel variant="embedded" view="orders" activeAsset={config.pair} />
              </TabsContent>

              <TabsContent value="trades" className="min-h-0 flex-1 overflow-auto p-3">
                <LiveAccountStatePanel variant="embedded" view="trades" activeAsset={config.pair} />
              </TabsContent>

              <TabsContent value="funding" className="min-h-0 flex-1 overflow-auto p-3">
                <LiveAccountStatePanel variant="embedded" view="funding" activeAsset={config.pair} />
              </TabsContent>

              <TabsContent value="local-orders" className="min-h-0 flex-1 overflow-auto p-3">
                <OrdersTable orders={orders} />
              </TabsContent>

              <TabsContent value="logs" className="min-h-0 flex-1 overflow-auto p-3">
                <div className="space-y-3">
                  <FillsTable fills={fills} />
                  <ActivityFeed events={events} />
                </div>
              </TabsContent>

              <TabsContent value="health" className="min-h-0 flex-1 overflow-auto p-3">
                <SyncStatusPanel variant="embedded" />
              </TabsContent>
            </Tabs>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto border-t bg-card/25 p-3 lg:border-t-0">
          <GridConfigPanel
            initialConfig={config}
            marketSnapshots={markets}
            challenge={challenge}
            activeBot={activeChallengeBot}
          />
        </aside>
      </div>
    </div>
  );
}

function ChallengeTicker({ challenge }: { challenge: ProprChallengeSummary }) {
  const toTarget = positiveDifference(challenge.profitTarget, challenge.realizedPnl);
  const dailyLossUsed = lossUsed(challenge.dayStartEquity, challenge.equity);
  const drawdownUsed = lossUsed(challenge.highWaterMark, challenge.equity);
  const sourceLabel = challenge.source === "propr_live" ? "Live API" : "Fallback";

  return (
    <div className="border-b bg-amber-500/8 px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-sm bg-amber-400/20 px-2 py-1 text-[11px] font-semibold text-amber-200">
            {challenge.label}
          </span>
          <span className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
            {sourceLabel}
          </span>
        </div>
        <TickerMetric label="Balance" value={`$${challenge.balance}`} />
        <TickerMetric label="Equity" value={`$${challenge.equity}`} />
        <TickerMetric label="Available" value={challenge.availableBalance ? `$${challenge.availableBalance}` : "n/a"} tone="up" />
        <TickerMetric label="Drawdown Used" value={`$${drawdownUsed} / ${challenge.drawdownUsedPct}%`} />
        <TickerMetric label="Daily Loss" value={`$${dailyLossUsed} / $${challenge.dailyLossLimit}`} />
        <TickerMetric label="Profit Target" value={`${challenge.profitProgressPct}% / ${challenge.ruleSet.profitTargetPct}%`} tone="up" />
        <TickerMetric label="To Target" value={`$${toTarget}`} tone="up" />
        <ProgressChip label="Daily" value={challenge.dailyLossUsedPct} />
        <ProgressChip label="DD" value={challenge.drawdownUsedPct} />
      </div>
    </div>
  );
}

function TickerMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className={["metric-mono font-semibold", tone === "up" ? "text-primary" : "", tone === "down" ? "text-destructive" : ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function ProgressChip({ label, value }: { label: string; value: string }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = pct >= 80 ? "bg-destructive" : pct >= 55 ? "bg-amber-400" : "bg-primary";

  return (
    <div className="flex min-w-[92px] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="metric-mono text-muted-foreground">{value}%</span>
    </div>
  );
}

function BotSwitcher({ bots, activeBotId }: { bots: Bot[]; activeBotId?: string }) {
  if (!bots.length) return null;

  return (
    <div className="mt-3 flex min-w-0 items-center gap-2 border-t pt-3 text-xs">
      <span className="shrink-0 text-muted-foreground">Bots</span>
      <div className="flex min-w-0 gap-2 overflow-x-auto">
        {bots.map((bot) => {
          const active = bot.id === activeBotId;
          return (
            <Link
              key={bot.id}
              href={`/grid-terminal?botId=${encodeURIComponent(bot.id)}`}
              prefetch={false}
              className={[
                "flex min-w-[190px] items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors",
                active
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground",
              ].join(" ")}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{bot.name}</span>
                <span className="mt-0.5 block metric-mono">
                  {formatMarketSymbol(bot.config.pair)} / {bot.config.positionSide.toUpperCase()} / {bot.config.leverage}x
                </span>
              </span>
              <span
                className={[
                  "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                  active ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
                ].join(" ")}
              >
                {bot.status.replaceAll("_", " ")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BotOverview({
  summary,
  runtimeMark,
}: {
  summary: BotPerformanceSummary;
  runtimeMark?: string;
}) {
  return (
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="order-2 min-w-0 space-y-3 2xl:order-1">
        <BotPerformanceStrip summary={summary} variant="embedded" />
        <div className="grid gap-2 md:grid-cols-4">
          <OverviewMetric label="Range" value={`${summary.bot.config.lowerPrice} - ${summary.bot.config.upperPrice}`} />
          <OverviewMetric label="Capital" value={`${summary.bot.config.capitalAllocation} USDC`} />
          <OverviewMetric label="Grid" value={`${summary.bot.config.gridCount} lines`} />
          <OverviewMetric label="Mark" value={runtimeMark ?? summary.lastPrice ?? "not synced"} />
        </div>
      </div>
      <div className="order-1 2xl:order-2">
        <PnlBreakdownPanel
          asset={summary.bot.config.pair}
          positionSide={summary.bot.config.positionSide}
          gridProfit={summary.realizedPnl}
          fees={summary.fees}
        />
      </div>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="metric-mono mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function OrdersTable({ orders }: { orders: PersistedOrder[] }) {
  if (!orders.length) {
    return <EmptyState title="No local orders" detail="Entry orders will appear here after deployment or sync." />;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.slice(0, 12).map((order) => (
            <TableRow key={order.id}>
              <TableCell>{formatMarketSymbol(order.asset)}</TableCell>
              <TableCell className={order.side === "buy" ? "text-primary" : "text-amber-200"}>
                {order.side}
                {order.reduce_only ? " RO" : ""}
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{order.status.replaceAll("_", " ")}</TableCell>
              <TableCell className="metric-mono">{order.quantity}</TableCell>
              <TableCell className="metric-mono text-right">{order.price ?? "market"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FillsTable({ fills }: { fills: PersistedFill[] }) {
  if (!fills.length) {
    return <EmptyState title="No fills yet" detail="Filled Propr orders will appear after sync." />;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="text-right">PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fills.slice(0, 12).map((fill) => (
            <TableRow key={fill.id}>
              <TableCell className="text-muted-foreground">{formatTime(fill.executedAt)}</TableCell>
              <TableCell>{formatMarketSymbol(fill.asset)}</TableCell>
              <TableCell className={fill.side === "buy" ? "text-primary" : "text-amber-200"}>{fill.side}</TableCell>
              <TableCell className="metric-mono">{fill.quantity}</TableCell>
              <TableCell className="metric-mono">{fill.price}</TableCell>
              <TableCell className={`metric-mono text-right ${Number(fill.realizedPnl) < 0 ? "text-destructive" : "text-primary"}`}>
                {signed(fill.realizedPnl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-md border border-dashed text-center">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function signed(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric >= 0 ? "+" : ""}${value}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function positiveDifference(target: string, current: string): string {
  try {
    const difference = decimal(target).minus(current);
    return toDecimalString(difference.gt(0) ? difference : 0, 2);
  } catch {
    return "0";
  }
}

function lossUsed(reference: string, current: string): string {
  try {
    const difference = decimal(reference).minus(current);
    return toDecimalString(difference.gt(0) ? difference : 0, 2);
  } catch {
    return "0";
  }
}
