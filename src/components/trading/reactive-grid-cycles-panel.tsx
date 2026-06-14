"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decimal, toDecimalString } from "@/domain/decimal";
import type { GridCycleReport, GridCycleRow } from "@/features/bots/grid-cycles";
import { cn } from "@/lib/utils";

export function ReactiveGridCyclesPanel({
  botId,
  initialReport,
}: {
  botId?: string;
  initialReport?: GridCycleReport | null;
}) {
  const [liveState, setLiveState] = useState<{ botId?: string; report: GridCycleReport | null }>({
    botId,
    report: initialReport ?? null,
  });
  const [loading, setLoading] = useState(false);
  const report = liveState.botId === botId ? liveState.report : initialReport ?? null;

  const loadReport = useCallback(async (showLoading = false) => {
    if (!botId) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/grid-cycles`, { cache: "no-store" });
      const payload = (await response.json()) as { data?: GridCycleReport };
      if (response.ok && payload.data) setLiveState({ botId, report: payload.data });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    if (!botId) return undefined;
    const timeout = window.setTimeout(() => void loadReport(false), 0);
    const interval = window.setInterval(() => void loadReport(false), 3000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [botId, loadReport]);

  if (!botId) {
    return <EmptyState title="No active bot" detail="Deploy a grid bot to see cycle performance." />;
  }

  if (!report) {
    return <EmptyState title="Grid cycles syncing" detail="Waiting for local fills and order links." />;
  }

  const rows = report.rows.slice(0, 80);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Grid cycle performance</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Pairs entry fills with reduce-only exits by grid band; Propr realized may differ because positions are merged.
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadReport(true)} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <CycleMetric label="Cycle PnL" value={`${signed(report.summary.closedNetPnl)} USDC`} tone={tone(report.summary.closedNetPnl)} />
        <CycleMetric label="Gross / Fees" value={`${signed(report.summary.closedGrossPnl)} / ${report.summary.closedFees}`} />
        <CycleMetric label="Closed cycles" value={String(report.summary.closedCycles)} detail={`${report.summary.winRatePct}% win rate`} />
        <CycleMetric label="Open cycles" value={String(report.summary.openCycles)} detail={`${report.summary.initialInventoryOpen} inventory qty`} />
        <CycleMetric label="Avg net/cycle" value={`${signed(report.summary.averageNetPnl)} USDC`} tone={tone(report.summary.averageNetPnl)} />
      </div>

      {report.summary.unmatchedExits > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
          {report.summary.unmatchedExits} reduce-only fill{report.summary.unmatchedExits > 1 ? "s" : ""} could not be paired with a tracked entry.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Band</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Exit / Target</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Fees</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <CycleRow key={row.id} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CycleMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-md border bg-background/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "metric-mono mt-1 truncate text-sm font-semibold",
          tone === "positive" && "text-primary",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {detail ? <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function CycleRow({ row }: { row: GridCycleRow }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant={row.status === "closed" ? "default" : row.status === "open" ? "outline" : "destructive"}>
          {row.status === "unmatched_exit" ? "unmatched" : row.status}
        </Badge>
      </TableCell>
      <TableCell className="metric-mono">{row.band}</TableCell>
      <TableCell className="capitalize text-muted-foreground">{row.source.replace("_", " ")}</TableCell>
      <TableCell>
        {row.entryPrice ? (
          <SidePrice side={row.entrySide} price={row.entryPrice} />
        ) : (
          <span className="text-muted-foreground">n/a</span>
        )}
      </TableCell>
      <TableCell>
        {row.exitPrice ? (
          <SidePrice side={row.exitSide} price={row.exitPrice} />
        ) : row.targetExitPrice ? (
          <span className="metric-mono text-muted-foreground">{row.targetExitPrice}</span>
        ) : (
          <span className="text-muted-foreground">pending</span>
        )}
      </TableCell>
      <TableCell className="metric-mono">{row.quantity}</TableCell>
      <TableCell className="metric-mono text-right">{signed(toDecimalString(row.grossPnl, 4))}</TableCell>
      <TableCell className="metric-mono text-right text-muted-foreground">{toDecimalString(row.fees, 4)}</TableCell>
      <TableCell className={cn("metric-mono text-right font-medium", tone(row.netPnl) === "positive" && "text-primary", tone(row.netPnl) === "negative" && "text-destructive")}>
        {signed(toDecimalString(row.netPnl, 4))}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{formatTime(row.exitAt ?? row.entryAt)}</TableCell>
    </TableRow>
  );
}

function SidePrice({ side, price }: { side?: "buy" | "sell"; price: string }) {
  return (
    <span className={cn("metric-mono", side === "buy" ? "text-sky-300" : "text-amber-200")}>
      {side ?? "order"} @ {toDecimalString(price, 4)}
    </span>
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

function tone(value: string) {
  const numeric = decimal(value);
  if (numeric.gt(0)) return "positive";
  if (numeric.lt(0)) return "negative";
  return undefined;
}

function signed(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric >= 0 ? "+" : ""}${value}`;
}

function formatTime(value?: string): string {
  if (!value) return "n/a";
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
