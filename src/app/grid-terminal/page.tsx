import { RefreshCw } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { ReactiveTerminalChart } from "@/components/charts/reactive-terminal-chart";
import { GridConfigPanel } from "@/components/trading/grid-config-panel";
import { ReactiveTerminalMetrics } from "@/components/trading/reactive-terminal-metrics";
import { StatusBadge } from "@/components/trading/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deriveDefaultGridConfigFromPrice } from "@/domain/grid-defaults";
import { formatMarketSymbol } from "@/domain/markets";
import { reconcilePaperRuntimeAction, reconcileProprRuntimeAction, simulateFillAction } from "@/features/bots/actions";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { getBotRuntimeState, getRuntimeMetrics, listBots, listEvents, listFills, listOrders } from "@/features/bots/repository";
import { getCandlesForConfig, getMarketSnapshots } from "@/features/market-data/service";

export const dynamic = "force-dynamic";

export default async function GridTerminalPage() {
  const bots = listBots();
  const activeBot = bots.find((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status)) ?? bots[0];
  const baseConfig = activeBot?.config ?? defaultBotConfig;
  const metrics = getRuntimeMetrics();
  const events = activeBot ? listEvents(20, activeBot.id) : [];
  const orders = activeBot ? listOrders(activeBot.id) : [];
  const fills = activeBot ? listFills(activeBot.id) : [];
  const runtimeState = activeBot ? getBotRuntimeState(activeBot.id) : null;
  const isChallengeBot = activeBot?.config.mode === "propr_live";
  const markets = await getMarketSnapshots();
  const market = markets.find((snapshot) => snapshot.asset === baseConfig.pair) ?? {
    asset: baseConfig.pair,
    mid: "0",
    funding: "0",
    timestamp: 0,
  };
  const config = activeBot?.config ?? deriveDefaultGridConfigFromPrice(baseConfig, market.mid);
  const candles = await getCandlesForConfig(config);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal">Grid Terminal</h1>
            <StatusBadge status={activeBot?.status ?? "draft"} />
          </div>
          <ReactiveTerminalMetrics initialPair={config.pair} markets={markets} metrics={metrics} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Candles, grid levels, fills and range limits</CardTitle>
            </CardHeader>
            <CardContent>
              <ReactiveTerminalChart initialConfig={config} candles={candles} />
            </CardContent>
          </Card>
          {activeBot ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Last runtime mark:{" "}
                <span className="metric-mono text-foreground">{runtimeState?.lastPrice ?? "not reconciled"}</span>
              </div>
              <div className="flex gap-2">
                <form action={isChallengeBot ? reconcileProprRuntimeAction : reconcilePaperRuntimeAction}>
                  <input type="hidden" name="id" value={activeBot.id} />
                  <Button type="submit" variant="outline">
                    <RefreshCw />
                    {isChallengeBot ? "Sync Propr" : "Reconcile"}
                  </Button>
                </form>
                <form action={simulateFillAction}>
                  <input type="hidden" name="id" value={activeBot.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isChallengeBot || !orders.some((order) => order.status === "open")}
                  >
                    Simulate next local fill
                  </Button>
                </form>
              </div>
            </div>
          ) : null}
          <Tabs defaultValue="orders" className="w-full">
            <TabsList>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="fills">Fills</TabsTrigger>
              <TabsTrigger value="logs">Bot logs</TabsTrigger>
            </TabsList>
            <TabsContent value="orders" className="rounded-lg border p-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                {orders.slice(0, 8).map((order) => (
                  <div key={order.id} className="grid grid-cols-[80px_80px_1fr_100px] gap-3 rounded-md border bg-muted/20 p-2">
                    <span className={order.side === "buy" ? "text-primary" : "text-amber-200"}>{order.side}</span>
                    <span>{order.status}</span>
                    <span className="metric-mono">{order.quantity} {formatMarketSymbol(order.asset)}</span>
                    <span className="metric-mono text-right">{order.price}</span>
                  </div>
                ))}
                {!orders.length ? "No persisted orders yet. Start a bot from the configuration panel." : null}
              </div>
            </TabsContent>
            <TabsContent value="fills" className="rounded-lg border p-3 text-sm text-muted-foreground">
              <div className="grid gap-2">
                {fills.slice(0, 8).map((fill) => (
                  <div key={fill.id} className="grid grid-cols-[80px_1fr_100px_100px] gap-3 rounded-md border bg-muted/20 p-2">
                    <span className={fill.side === "buy" ? "text-primary" : "text-amber-200"}>{fill.side}</span>
                    <span className="metric-mono">{fill.quantity} {formatMarketSymbol(fill.asset)}</span>
                    <span className="metric-mono text-right">{fill.price}</span>
                    <span className="metric-mono text-right">{fill.fee}</span>
                  </div>
                ))}
                {!fills.length ? "No persisted fills yet. Use the simulator button to fill the next local order." : null}
              </div>
            </TabsContent>
            <TabsContent value="logs" className="rounded-lg border p-3">
              <ActivityFeed events={events} />
            </TabsContent>
          </Tabs>
        </div>
        <GridConfigPanel marketSnapshots={markets} />
      </div>
    </div>
  );
}
