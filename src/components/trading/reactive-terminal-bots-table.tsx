"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/trading/status-badge";
import { useTerminalLiveSnapshot, type TerminalLiveSnapshot } from "@/components/trading/terminal-live-feed";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decimal, toDecimalString } from "@/domain/decimal";
import { formatMarketSymbol } from "@/domain/markets";
import type { ExecutionPosition } from "@/features/execution/types";

export function ReactiveTerminalBotsTable({
  activeBotId,
  initialSnapshot,
}: {
  activeBotId?: string;
  initialSnapshot: TerminalLiveSnapshot;
}) {
  const snapshot = useTerminalLiveSnapshot(initialSnapshot) ?? initialSnapshot;
  const rows = snapshot.bots;

  if (!rows.length) {
    return <EmptyState title="No active bots" detail="Deploy a grid bot to monitor it from this terminal table." />;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bot</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>PnL</TableHead>
            <TableHead>uPnL</TableHead>
            <TableHead>Return</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Exposure</TableHead>
            <TableHead className="text-right">Last fill</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((summary) => {
            const active = summary.bot.id === activeBotId;
            const pnl = decimal(summary.trackedPnl);
            const returnPct = decimal(summary.trackedPnlPct);
            const livePosition = findMatchingPosition(snapshot.livePositions, summary);

            return (
              <TableRow key={summary.bot.id} className={active ? "bg-primary/10" : undefined}>
                <TableCell>
                  <Link
                    href={`/grid-terminal?botId=${encodeURIComponent(summary.bot.id)}`}
                    prefetch={false}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {summary.bot.name}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatMarketSymbol(summary.bot.config.pair)} / {summary.bot.config.positionSide.toUpperCase()} /{" "}
                    {summary.bot.config.leverage}x / {summary.bot.config.lowerPrice}-{summary.bot.config.upperPrice}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={summary.bot.status} />
                    <span className="rounded border px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {summary.stateLabel}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <SignedMetric value={toDecimalString(pnl, 2)} suffix="USDC" />
                  <div className="mt-1 text-xs text-muted-foreground">
                    gross {signed(summary.realizedPnl)} / fees {summary.fees}
                  </div>
                </TableCell>
                <TableCell>
                  {livePosition ? (
                    <>
                      <SignedMetric value={toDecimalString(livePosition.unrealizedPnl, 2)} suffix="USDC" />
                      <div className="mt-1 text-xs text-muted-foreground">Propr live position</div>
                    </>
                  ) : (
                    <>
                      <div className="metric-mono font-semibold text-muted-foreground">n/a</div>
                      <div className="mt-1 text-xs text-muted-foreground">no open position</div>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <SignedMetric value={toDecimalString(returnPct, 2)} suffix="%" />
                  <div className="mt-1 text-xs text-muted-foreground">on {summary.bot.config.capitalAllocation} USDC</div>
                </TableCell>
                <TableCell className="metric-mono">
                  <div>{summary.openOrders} open</div>
                  <div className="mt-1 text-xs text-muted-foreground">{summary.filledOrders} filled</div>
                </TableCell>
                <TableCell className="metric-mono">
                  <div>{summary.exposure} USDC</div>
                  <div className="mt-1 text-xs text-muted-foreground">{summary.volume} volume</div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {summary.lastFillAt ? formatTime(summary.lastFillAt) : "none"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function findMatchingPosition(
  positions: ExecutionPosition[],
  summary: TerminalLiveSnapshot["bots"][number],
): ExecutionPosition | undefined {
  return positions.find(
    (position) =>
      position.asset === summary.bot.config.pair &&
      position.positionSide === summary.bot.config.positionSide,
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

function SignedMetric({ value, suffix }: { value: string; suffix: string }) {
  const numeric = Number(value);
  return (
    <div className={`metric-mono font-semibold ${numeric > 0 ? "text-primary" : numeric < 0 ? "text-destructive" : ""}`}>
      {signed(value)} {suffix}
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
