"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decimal, toDecimalString, type Decimal } from "@/domain/decimal";
import { formatMarketSymbol } from "@/domain/markets";
import type { MarketSymbol, PositionSide } from "@/domain/types";
import { cn } from "@/lib/utils";

interface LiveAccountPosition {
  id: string;
  asset: MarketSymbol;
  positionSide: PositionSide;
  quantity: string;
  unrealizedPnl: string;
  leverage: string;
}

interface LiveAccountState {
  ok: boolean;
  checkedAt: string;
  reason?: string;
  positions: LiveAccountPosition[];
}

export function PnlBreakdownPanel({
  asset,
  positionSide,
  gridProfit,
  fees,
  funding = "0",
}: {
  asset: MarketSymbol;
  positionSide: PositionSide;
  gridProfit: string;
  fees: string;
  funding?: string;
}) {
  const [state, setState] = useState<LiveAccountState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadState = useCallback(async (showLoading = false) => {
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
    const interval = window.setInterval(() => void loadState(false), 3000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadState]);

  const breakdown = useMemo(() => {
    const matchingPositions = (state?.positions ?? []).filter(
      (position) => position.asset === asset && position.positionSide === positionSide,
    );
    const liveUnrealized = matchingPositions.reduce((sum, position) => sum.plus(safeDecimal(position.unrealizedPnl)), decimal(0));
    const fundingFee = safeDecimal(funding);
    const currentTrendPnl = liveUnrealized.plus(fundingFee);
    const grid = safeDecimal(gridProfit);
    const feeCost = safeDecimal(fees).abs();
    const trackedTotal = currentTrendPnl.plus(grid);

    return {
      liveUnrealized,
      fundingFee,
      currentTrendPnl,
      grid,
      feeCost,
      trackedTotal,
      matchingPositionCount: matchingPositions.length,
    };
  }, [asset, fees, funding, gridProfit, positionSide, state?.positions]);

  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="size-4 text-primary" />
            PnL Breakdown
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMarketSymbol(asset)} / {positionSide.toUpperCase()} live position + local fills
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={state?.ok ? "default" : state?.reason ? "destructive" : "outline"}>
            {state ? (state.ok ? "Live" : "Blocked") : "Syncing"}
          </Badge>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => void loadState(true)}
            disabled={loading}
            aria-label="Refresh PnL breakdown"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-muted/25 p-3">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-2 text-center text-xs">
          <FormulaValue label="Tracked total" value={breakdown.trackedTotal} />
          <span className="pt-1.5 text-muted-foreground">=</span>
          <FormulaValue label="Current trend PnL" value={breakdown.currentTrendPnl} />
          <span className="pt-1.5 text-muted-foreground">+</span>
          <FormulaValue label="Grid profit" value={breakdown.grid} />
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-xs">
        <BreakdownRow label="Live uPnL" value={breakdown.liveUnrealized} />
        <BreakdownRow label="Funding fee" value={breakdown.fundingFee} />
        <BreakdownRow label="Grid profit" value={breakdown.grid} />
        <BreakdownRow label="Fees tracked" value={breakdown.feeCost.neg()} muted />
      </div>

      <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        {breakdown.matchingPositionCount > 0
          ? `${breakdown.matchingPositionCount} matching Propr position${breakdown.matchingPositionCount > 1 ? "s" : ""}.`
          : "No matching open Propr position yet."}{" "}
        Fees are shown for control and are not subtracted twice from Propr PnL.
      </div>

      {state?.reason ? (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {state.reason}
        </div>
      ) : null}
    </div>
  );
}

function FormulaValue({ label, value }: { label: string; value: Decimal }) {
  return (
    <div className="min-w-0">
      <div className={cn("metric-mono truncate text-sm font-semibold", toneClass(value))}>{signedDecimal(value)}</div>
      <div className="mt-1 text-muted-foreground">{label}</div>
    </div>
  );
}

function BreakdownRow({ label, value, muted = false }: { label: string; value: Decimal; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("metric-mono font-medium", muted ? "text-muted-foreground" : toneClass(value))}>
        {signedDecimal(value)} USDC
      </span>
    </div>
  );
}

function safeDecimal(value: string | number | undefined): Decimal {
  try {
    return decimal(value ?? 0);
  } catch {
    return decimal(0);
  }
}

function signedDecimal(value: Decimal): string {
  const formatted = toDecimalString(value, 2);
  return `${value.gte(0) ? "+" : ""}${formatted}`;
}

function toneClass(value: Decimal): string | undefined {
  if (value.gt(0)) return "text-primary";
  if (value.lt(0)) return "text-destructive";
  return undefined;
}
