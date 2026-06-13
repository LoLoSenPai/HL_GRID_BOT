import Link from "next/link";
import { Copy, Pause, Pencil, Play, Square, SquareTerminal, Trash2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { formatMarketSymbol } from "@/domain/markets";
import type { Bot } from "@/domain/types";
import { getBotPerformanceRows } from "@/features/bots/performance";
import {
  deleteBotAction,
  duplicateBotAction,
  pauseBotAction,
  resumeBotAction,
  stopBotAction,
} from "@/features/bots/actions";
import { cn } from "@/lib/utils";

export function BotTable({ bots }: { bots: Bot[] }) {
  const rows = getBotPerformanceRows(bots);

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bot</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>PnL</TableHead>
            <TableHead>Return</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Exposure</TableHead>
            <TableHead className="w-[260px] text-right">Actions</TableHead>
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
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={summary.bot.status} />
                  <Badge variant="outline" className="capitalize">
                    {summary.stateLabel}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <PnlValue value={summary.trackedPnl} suffix="USDC" />
                <div className="mt-1 text-xs text-muted-foreground">Closed {signed(summary.realizedPnl)} USDC</div>
              </TableCell>
              <TableCell>
                <PnlValue value={summary.trackedPnlPct} suffix="%" />
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
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/grid-terminal?botId=${encodeURIComponent(summary.bot.id)}`}
                    className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
                    aria-label="Open bot in terminal"
                  >
                    <SquareTerminal />
                  </Link>
                  <Link
                    href={`/bots/${summary.bot.id}`}
                    className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
                    aria-label="Edit bot"
                  >
                    <Pencil />
                  </Link>
                  <BotAction action={duplicateBotAction} id={summary.bot.id} label="Duplicate bot">
                    <Copy />
                  </BotAction>
                  <BotAction action={resumeBotAction} id={summary.bot.id} label="Resume bot">
                    <Play />
                  </BotAction>
                  <BotAction action={pauseBotAction} id={summary.bot.id} label="Pause bot">
                    <Pause />
                  </BotAction>
                  <BotAction action={stopBotAction} id={summary.bot.id} label="Stop bot">
                    <Square />
                  </BotAction>
                  <BotAction action={deleteBotAction} id={summary.bot.id} label="Delete bot">
                    <Trash2 />
                  </BotAction>
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

function BotAction({
  action,
  id,
  label,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button size="icon-sm" variant="ghost" aria-label={label} type="submit">
        {children}
      </Button>
    </form>
  );
}
