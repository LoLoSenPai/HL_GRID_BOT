import { ActivityFeed } from "@/components/activity/activity-feed";
import { BotTable } from "@/components/bots/bot-table";
import { ChallengePanel } from "@/components/trading/challenge-panel";
import { MarketOverviewTable } from "@/components/trading/market-overview-table";
import { MetricCard } from "@/components/trading/metric-card";
import { RiskPanel } from "@/components/trading/risk-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decimal, toDecimalString } from "@/domain/decimal";
import { getRuntimeMetrics, listBots, listEvents } from "@/features/bots/repository";
import { getMarketSnapshots } from "@/features/market-data/service";
import { getProprChallengeSummary } from "@/features/propr/challenge-summary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const marketsPromise = getMarketSnapshots();
  const bots = listBots();
  const events = listEvents(3);
  const metrics = getRuntimeMetrics();
  const challengePromise = getProprChallengeSummary(metrics);
  const activeBots = bots.filter((bot) => ["paper", "running", "live", "out_of_range"].includes(bot.status)).length;
  const [markets, challenge] = await Promise.all([marketsPromise, challengePromise]);
  const challengePnl = toDecimalString(decimal(challenge.realizedPnl).plus(challenge.unrealizedPnl), 2);
  const signedChallengePnl = `${Number(challengePnl) >= 0 ? "+" : ""}${challengePnl}`;
  const challengeSourceDetail =
    challenge.source === "propr_live" ? "Active Propr challenge" : "Propr sync fallback";

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 lg:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Global account, bot risk and volume overview.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Challenge equity" value={`${challenge.equity} USDC`} detail={challengeSourceDetail} />
        <MetricCard label="Challenge PnL" value={`${signedChallengePnl} USDC`} detail="Realized and unrealized" />
        <MetricCard label="Volume generated" value={`${metrics.volume} USDC`} detail="Persisted fills" />
        <MetricCard label="Active bots" value={String(activeBots)} detail={`${bots.length} total bots`} />
      </div>

      <ChallengePanel challenge={challenge} />

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">Markets</CardTitle>
        </CardHeader>
        <CardContent>
          <MarketOverviewTable markets={markets} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm">Open positions and bots</CardTitle>
          </CardHeader>
          <CardContent>
            <BotTable bots={bots} />
          </CardContent>
        </Card>
        <RiskPanel metrics={metrics} challenge={challenge} />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
