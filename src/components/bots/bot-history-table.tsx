import Link from "next/link";
import { Copy, SquareTerminal } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/trading/status-badge";
import { formatMarketSymbol } from "@/domain/markets";
import type { Bot } from "@/domain/types";
import { duplicateBotAction } from "@/features/bots/actions";
import { getBotPerformanceRows } from "@/features/bots/performance";
import { cn } from "@/lib/utils";

export function BotHistoryTable({ bots }: { bots: Bot[] }) {
  const rows = getBotPerformanceRows(bots);

  if (!rows.length) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed text-center">
        <div className="text-sm font-medium">No bot history</div>
        <div className="mt-1 max-w-sm text-xs text-muted-foreground">
          Stopped or errored bots will appear here after tests.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bot</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total PnL</TableHead>
            <TableHead>Return</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Volume</TableHead>
            <TableHead className="text-right">Closed</TableHead>
            <TableHead className="w-[120px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((summary) => (
            <TableRow key={summary.bot.id}>
              <TableCell>
                <Link
                  href={`/grid-terminal?botId=${encodeURIComponent(summary.bot.id)}`}
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
                <StatusBadge status={summary.bot.status} />
              </TableCell>
              <TableCell>
                <PnlValue value={summary.trackedPnl} suffix="USDC" />
                <div className="mt-1 text-xs text-muted-foreground">
                  gross {signed(summary.realizedPnl)} / fees {summary.fees}
                </div>
              </TableCell>
              <TableCell>
                <PnlValue value={summary.trackedPnlPct} suffix="%" />
                <div className="mt-1 text-xs text-muted-foreground">on {summary.bot.config.capitalAllocation} USDC</div>
              </TableCell>
              <TableCell className="metric-mono">
                <div>{summary.filledOrders} filled</div>
                <div className="mt-1 text-xs text-muted-foreground">{summary.openOrders} open</div>
              </TableCell>
              <TableCell className="metric-mono">{summary.volume} USDC</TableCell>
              <TableCell className="text-right text-muted-foreground">{formatTime(summary.bot.updatedAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/grid-terminal?botId=${encodeURIComponent(summary.bot.id)}`}
                    className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
                    aria-label="Inspect bot"
                  >
                    <SquareTerminal />
                  </Link>
                  <form action={duplicateBotAction}>
                    <input type="hidden" name="id" value={summary.bot.id} />
                    <Button size="icon-sm" variant="ghost" aria-label="Recreate bot" type="submit">
                      <Copy />
                    </Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PnlValue({ value, suffix }: { value: string; suffix: string }) {
  const numeric = Number(value);
  return (
    <div className={cn("metric-mono font-semibold", numeric > 0 && "text-primary", numeric < 0 && "text-destructive")}>
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
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
