"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decimal, toDecimalString } from "@/domain/decimal";
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
  cumulativeQuantity: string;
  createdAt: string;
}

interface LiveAccountPosition {
  id: string;
  asset: MarketSymbol;
  positionSide: PositionSide;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  realizedPnl?: string;
  leverage: string;
  liquidationPrice?: string;
  marginUsed?: string;
  cumulativeFunding?: string;
  cumulativeTradingFees?: string;
  returnOnEquity?: string;
}

interface LiveAccountTrade {
  id: string;
  asset: MarketSymbol;
  side: OrderSide;
  quantity: string;
  price: string;
  fee?: string;
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

type LiveAccountView = "summary" | "positions" | "orders" | "trades" | "funding";

let liveAccountStateCache: LiveAccountState | null = null;

export function LiveAccountStatePrefetch() {
  useEffect(() => {
    if (liveAccountStateCache) return;

    let active = true;
    void fetchLiveAccountState().then((nextState) => {
      if (!active) return;
      liveAccountStateCache = nextState;
    });

    return () => {
      active = false;
    };
  }, []);

  return null;
}

export function LiveAccountStatePanel({
  variant = "card",
  view = "summary",
  activeAsset,
}: {
  variant?: "card" | "embedded";
  view?: LiveAccountView;
  activeAsset?: MarketSymbol;
} = {}) {
  const [state, setState] = useState<LiveAccountState | null>(liveAccountStateCache);
  const [loading, setLoading] = useState(false);

  const loadState = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      liveAccountStateCache = await fetchLiveAccountState();
      setState(liveAccountStateCache);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadState(false), 0);
    const interval = window.setInterval(() => void loadState(false), 3000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadState]);

  const refreshButton = (
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
  );

  const scopedOrders = (state?.openOrders ?? []).filter((order) => !activeAsset || order.asset === activeAsset);
  const scopedPositions = (state?.positions ?? []).filter((position) => !activeAsset || position.asset === activeAsset);
  const scopedTrades = (state?.trades ?? []).filter((trade) => !activeAsset || trade.asset === activeAsset);

  const content = (
    <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={!state ? "outline" : state.ok ? "default" : "destructive"}>
            {!state ? "Syncing Propr" : state.ok ? "Propr read OK" : "Propr read blocked"}
          </Badge>
          <Badge variant="outline">{state ? relativeTime(state.checkedAt) : "syncing"}</Badge>
          <Badge variant="outline">{scopedOrders.length} open orders</Badge>
          <Badge variant="outline">{scopedPositions.length} positions</Badge>
          {activeAsset ? <Badge variant="outline">{formatMarketSymbol(activeAsset)}</Badge> : null}
        </div>

        {state?.reason ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {state.reason}
          </div>
        ) : null}

        {view === "summary" || view === "orders" ? (
          <CompactTable
            title="Open orders"
            columns={["Asset", "Direction", "Type", "Filled / Size", "Order Value", "Price", "Reduce Only", "Time"]}
            rows={scopedOrders.slice(0, view === "summary" ? 5 : 20).map((order) => [
              formatMarketSymbol(order.asset),
              order.side,
              order.type,
              `${order.cumulativeQuantity ?? "0"} / ${order.quantity}`,
              orderValue(order.quantity, order.price),
              order.price ?? "market",
              order.reduceOnly ? "Yes" : "No",
              formatTime(order.createdAt),
            ])}
            empty="No open Propr orders."
          />
        ) : null}

        {view === "summary" || view === "positions" ? (
          <CompactTable
            title="Positions"
            columns={["Asset", "Side", "Size", "Position Value", "Entry", "Mark", "uPnL", "Net Realized", "Margin", "ROE", "Liq. Price"]}
            rows={scopedPositions.slice(0, view === "summary" ? 5 : 20).map((position) => [
              formatMarketSymbol(position.asset),
              `${position.positionSide} ${position.leverage}x`,
              position.quantity,
              positionValue(position),
              position.entryPrice,
              position.markPrice,
              signed(position.unrealizedPnl),
              signed(netRealizedPnl(position)),
              position.marginUsed ?? "n/a",
              liveReturnPct(position),
              position.liquidationPrice ?? "n/a",
            ])}
            empty="No open Propr positions."
          />
        ) : null}

        {view === "summary" || view === "trades" ? (
          <CompactTable
            title="Trade history"
            columns={["Time", "Asset", "Side", "Qty", "Price", "Fee", "Realized PnL"]}
            rows={scopedTrades.slice(0, view === "summary" ? 5 : 20).map((trade) => [
              formatTime(trade.executedAt),
              formatMarketSymbol(trade.asset),
              trade.side,
              trade.quantity,
              trade.price,
              trade.fee ?? "n/a",
              signed(trade.realizedPnl),
            ])}
            empty="No recent Propr trades."
          />
        ) : null}

        {view === "funding" ? (
          <CompactTable
            title="Funding and position fees"
            columns={["Asset", "Side", "Size", "Funding", "Trading Fees", "ROE"]}
            rows={scopedPositions.map((position) => [
              formatMarketSymbol(position.asset),
              position.positionSide,
              position.quantity,
              signed(position.cumulativeFunding ?? "0"),
              signed(position.cumulativeTradingFees ?? "0"),
              liveReturnPct(position),
            ])}
            empty="No funding data from Propr for this asset yet."
          />
        ) : null}
      </div>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <WalletCards className="size-4 text-primary" />
            Propr account
          </div>
          {refreshButton}
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <WalletCards className="size-4 text-primary" />
            Propr account
          </CardTitle>
          {refreshButton}
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

async function fetchLiveAccountState(): Promise<LiveAccountState | null> {
  const response = await fetch("/api/propr/account-state", { cache: "no-store" });
  const payload = (await response.json()) as { data?: LiveAccountState };
  return payload.data ?? null;
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

function orderValue(quantity: string, price?: string): string {
  if (!price) return "market";
  try {
    return `${toDecimalString(decimal(quantity).mul(price), 2)} USDC`;
  } catch {
    return "n/a";
  }
}

function positionValue(position: LiveAccountPosition): string {
  try {
    return `${toDecimalString(decimal(position.quantity).mul(position.markPrice), 2)} USDC`;
  } catch {
    return "n/a";
  }
}

function netRealizedPnl(position: LiveAccountPosition): string {
  try {
    return toDecimalString(
      decimal(position.realizedPnl ?? "0")
        .plus(position.cumulativeFunding ?? "0")
        .minus(position.cumulativeTradingFees ?? "0"),
      4,
    );
  } catch {
    return position.realizedPnl ?? "0";
  }
}

function liveReturnPct(position: LiveAccountPosition): string {
  try {
    const value = position.returnOnEquity
      ? decimal(position.returnOnEquity).mul(100)
      : decimal(position.marginUsed ?? "0").gt(0)
        ? decimal(position.unrealizedPnl).div(position.marginUsed ?? "0").mul(100)
        : decimal(0);
    return `${toDecimalString(value, 2)}%`;
  } catch {
    return "n/a";
  }
}

function signed(value: string): string {
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
