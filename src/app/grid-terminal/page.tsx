import { RefreshCw } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ReactiveTerminalChart } from "@/components/charts/reactive-terminal-chart";
import { ReactiveChallengeTicker } from "@/components/trading/reactive-challenge-ticker";
import { ReactiveTerminalBotsTable } from "@/components/trading/reactive-terminal-bots-table";
import { BotPerformanceStrip } from "@/components/trading/bot-performance-strip";
import { GridConfigPanel } from "@/components/trading/grid-config-panel";
import { LiveAccountStatePanel, LiveAccountStatePrefetch } from "@/components/trading/live-account-state-panel";
import { PnlBreakdownPanel } from "@/components/trading/pnl-breakdown-panel";
import { ReactiveRuntimeMark } from "@/components/trading/reactive-runtime-mark";
import { ReactiveTerminalMetrics } from "@/components/trading/reactive-terminal-metrics";
import { StatusBadge } from "@/components/trading/status-badge";
import { SyncStatusPanel } from "@/components/trading/sync-status-panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deriveDefaultGridConfigFromPrice } from "@/domain/grid-defaults";
import { formatMarketPair, formatMarketSymbol } from "@/domain/markets";
import { reconcilePaperRuntimeAction, reconcileProprRuntimeAction } from "@/features/bots/actions";
import { getBotPerformance, getBotPerformanceRows, type BotPerformanceSummary } from "@/features/bots/performance";
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
import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";
import type { ExecutionPosition } from "@/features/execution/types";
import { getProprChallengeSummary } from "@/features/propr/challenge-summary";
import { mergeProprWsPositionSnapshots } from "@/features/propr/ws-position-cache";
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
  const terminalBots = bots.filter(isTerminalActiveBot);
  const activeBot =
    requestedBot ?? terminalBots.find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status)) ?? terminalBots[0] ?? bots[0];
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
          id: activeBot.id,
          name: activeBot.name,
          status: activeBot.status,
          pair: activeBot.config.pair,
          openOrders: orders.filter((order) => order.status === "open").length,
        }
      : null;
  const [markets, challenge, livePositions] = await Promise.all([
    getMarketSnapshots(),
    getProprChallengeSummary(metrics),
    loadLivePositions(),
  ]);
  const initialLiveSnapshot = {
    checkedAt: new Date().toISOString(),
    markets,
    challenge,
    bots: getBotPerformanceRows(terminalBots),
    livePositions,
  };
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
          <ReactiveTerminalMetrics
            initialPair={config.pair}
            markets={markets}
            challenge={challenge}
            initialSnapshot={initialLiveSnapshot}
          />
        </div>
      </div>
      <ReactiveChallengeTicker initialChallenge={challenge} initialSnapshot={initialLiveSnapshot} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_300px] overflow-hidden lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">Chart</span>
              <span className="text-muted-foreground">15m candles / grid levels / SL / TP</span>
            </div>
            <div className="text-muted-foreground">
              Live mark:{" "}
              <ReactiveRuntimeMark
                initialPair={config.pair}
                fallback={runtimeState?.lastPrice ?? market.mid}
                initialSnapshot={initialLiveSnapshot}
              />
            </div>
          </div>

          <section className="min-h-0 overflow-hidden p-3">
            <ReactiveTerminalChart
              initialConfig={config}
              candles={candles}
              orders={chartOrders}
              className="h-full"
              initialSnapshot={initialLiveSnapshot}
            />
          </section>

          <section className="min-h-0 border-t bg-muted/10">
            <LiveAccountStatePrefetch />
            <Tabs defaultValue="bots" className="h-full gap-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <TabsList variant="line" className="h-8 rounded-none p-0">
                  <TabsTrigger value="bots">Active Bots</TabsTrigger>
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

              <TabsContent value="bots" className="min-h-0 flex-1 overflow-auto p-3">
                <ReactiveTerminalBotsTable activeBotId={activeBot?.id} initialSnapshot={initialLiveSnapshot} />
              </TabsContent>

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

function isTerminalActiveBot(bot: Bot): boolean {
  return ["paper", "running", "live", "out_of_range", "paused"].includes(bot.status);
}

async function loadLivePositions(): Promise<ExecutionPosition[]> {
  try {
    const adapter = new ProprExecutionAdapter();
    const health = await adapter.health();
    if (!health.ok) return [];
    return mergeProprWsPositionSnapshots(await adapter.getPositions());
  } catch {
    return [];
  }
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
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
