"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMarketSymbol } from "@/domain/markets";
import type { MarketSymbol, OrderSide, PositionSide } from "@/domain/types";

interface LiveAccountOrder {
  id: string;
  asset: MarketSymbol;
  side: OrderSide;
  positionSide: PositionSide;
  type: string;
  quantity: string;
  price?: string;
  status: string;
  reduceOnly: boolean;
}

interface LiveAccountPosition {
  id: string;
  asset: MarketSymbol;
  positionSide: PositionSide;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: string;
}

interface LiveAccountTrade {
  id: string;
  asset: MarketSymbol;
  side: OrderSide;
  quantity: string;
  price: string;
  realizedPnl: string;
  executedAt: string;
}

interface LiveAccountState {
  ok: boolean;
  checkedAt: string;
  reason?: string;
  openOrders: LiveAccountOrder[];
  positions: LiveAccountPosition[];
  trades: LiveAccountTrade[];
}

export function LiveAccountStatePanel() {
  const [state, setState] = useState<LiveAccountState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadState = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/propr/account-state", { cache: "no-store" });
      const payload = (await response.json()) as { data?: LiveAccountState };
      setState(payload.data ?? null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadState(false), 0);
    const interval = window.setInterval(() => void loadState(false), 8000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadState]);

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <WalletCards className="size-4 text-primary" />
            Live account state
          </CardTitle>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => void loadState()}
            disabled={loading}
            aria-label="Refresh Propr account state"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={state?.ok ? "default" : "destructive"}>{state?.ok ? "Propr read OK" : "Propr read blocked"}</Badge>
          <Badge variant="outline">{state ? relativeTime(state.checkedAt) : "syncing"}</Badge>
          <Badge variant="outline">{state?.openOrders.length ?? 0} open orders</Badge>
          <Badge variant="outline">{state?.positions.length ?? 0} positions</Badge>
        </div>

        {state?.reason ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {state.reason}
          </div>
        ) : null}

        <CompactTable
          title="Open orders"
          columns={["Asset", "Side", "Qty", "Price"]}
          rows={(state?.openOrders ?? []).slice(0, 5).map((order) => [
            formatMarketSymbol(order.asset),
            `${order.side}${order.reduceOnly ? " RO" : ""}`,
            order.quantity,
            order.price ?? "market",
          ])}
          empty="No open Propr orders."
        />

        <CompactTable
          title="Positions"
          columns={["Asset", "Side", "Qty", "uPnL"]}
          rows={(state?.positions ?? []).slice(0, 5).map((position) => [
            formatMarketSymbol(position.asset),
            `${position.positionSide} ${position.leverage}x`,
            position.quantity,
            position.unrealizedPnl,
          ])}
          empty="No open Propr positions."
        />

        <CompactTable
          title="Recent trades"
          columns={["Asset", "Side", "Qty", "Price"]}
          rows={(state?.trades ?? []).slice(0, 5).map((trade) => [
            formatMarketSymbol(trade.asset),
            trade.side,
            trade.quantity,
            trade.price,
          ])}
          empty="No recent Propr trades."
        />
      </CardContent>
    </Card>
  );
}

function CompactTable({
  title,
  columns,
  rows,
  empty,
}: {
  title: string;
  columns: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="rounded-md border">
      <div className="border-b px-3 py-2 text-xs font-medium">{title}</div>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column} className="h-8 text-xs">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.join(":")}>
                {row.map((cell, index) => (
                  <TableCell key={`${cell}-${index}`} className="py-1.5 text-xs">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  );
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
