"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Plus, Rocket, ShieldCheck, Square, TrendingDown, TrendingUp, X, Zap } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  deriveDefaultGridConfigFromPrice,
  deriveGridConfigForPositionSide,
} from "@/domain/grid-defaults";
import {
  formatMarketPair,
  formatMarketSymbol,
  MARKET_DEFINITIONS,
} from "@/domain/markets";
import { estimateGridPreview, type GridPreview } from "@/domain/grid-preview";
import { maxProprLeverageForAsset } from "@/domain/propr-rules";
import {
  type GridConfig,
  type BotStatus,
  type MarketSnapshot,
  type MarketSymbol,
  type PositionSide,
} from "@/domain/types";
import { validateBotConfig } from "@/domain/risk";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/use-terminal-store";

interface ChallengeRiskPreflight {
  status: "pass" | "warning" | "blocked" | "invalid";
  candidateWorstCase: string;
  candidateLossToStop: string;
  candidateStopBuffer: string;
  candidateAutoOrderSize: string;
  candidateEntryOrderCount: number;
  candidateTotalEntryNotional: string;
  committedWorstCase: string;
  dailyRemaining: string;
  dailyStopPct: string;
  dailyStopAmount: string;
  dailyStopFloor: string;
  dailyDistanceToStop: string;
  dailyStopUsedPct: string;
  dailyStatus: "safe" | "warning" | "stop";
  drawdownRemaining: string;
  remainingBudget: string;
  recommendedCapitalAllocation: string;
  recommendedRiskSizedNotional: string;
  recommendedGridOrders: number;
  recommendedAverageGridPrice: string;
  recommendedDrawdownToStopPct: string;
  recommendedSpacingMinPct: string;
  recommendedBudgetUsePct: string;
  blockers: string[];
  warnings: string[];
}

interface ActiveChallengeBotSummary {
  id: string;
  name: string;
  status: BotStatus;
  pair: MarketSymbol;
  openOrders: number;
}

function clampLeverage(value: number, max: number) {
  return Math.min(Math.max(Math.round(value), 1), max);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function LeverageControl({
  max,
  value,
  onChange,
}: {
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="metric-mono text-lg font-semibold">{value}x</div>
        <div className="text-xs text-muted-foreground">Max {max}x</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Decrease leverage"
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <Slider
          value={[value]}
          min={1}
          max={max}
          step={1}
          className="flex-1"
          onValueChange={(nextValue) => {
            const leverage = Array.isArray(nextValue) ? nextValue[0] : nextValue;
            onChange(leverage ?? value);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Increase leverage"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function StrategySelector({
  value,
  onChange,
}: {
  value: PositionSide;
  onChange: (value: PositionSide) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Strategy direction">
      <Button
        type="button"
        variant="outline"
        aria-pressed={value === "long"}
        onClick={() => onChange("long")}
        className={cn(
          "h-auto min-h-[84px] flex-col items-start gap-1 p-3 text-left hover:border-primary/60 hover:bg-primary/10",
          value === "long" && "border-primary bg-primary/20 ring-1 ring-primary/40",
        )}
      >
        <span className="flex items-center gap-2 font-semibold text-primary">
          <TrendingUp />
          LONG
        </span>
        <span className="text-xs text-muted-foreground">Buy dips, reduce higher.</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-pressed={value === "short"}
        onClick={() => onChange("short")}
        className={cn(
          "h-auto min-h-[84px] flex-col items-start gap-1 p-3 text-left hover:border-destructive/60 hover:bg-destructive/10",
          value === "short" && "border-destructive bg-destructive/20 ring-1 ring-destructive/40",
        )}
      >
        <span className="flex items-center gap-2 font-semibold text-destructive">
          <TrendingDown />
          SHORT
        </span>
        <span className="text-xs text-muted-foreground">Sell rips, reduce lower.</span>
      </Button>
    </div>
  );
}

function GridPreviewSummary({ preview }: { preview: GridPreview }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3">
      <PreviewMetric label="Grid lines" value={String(preview.lineCount)} />
      <PreviewMetric label="Entry orders" value={String(preview.entryOrderCount)} />
      <PreviewMetric label="Auto order size" value={`$${preview.autoOrderSize}`} />
      <PreviewMetric label="Total notional" value={`$${preview.totalNotional}`} />
      <PreviewMetric label="Effective spacing" value={`${preview.spacingPct}%`} />
      <PreviewMetric label="Profit / cycle" value={`$${preview.profitPerCycle}`} />
      <PreviewMetric label="Loss to SL + buffer" value={`$${preview.worstCaseLoss}`} tone="destructive" />
      <PreviewMetric
        label="Spacing status"
        value={preview.spacingStatus === "ok" ? "OK" : "Tight"}
        tone={preview.spacingStatus === "ok" ? "primary" : "destructive"}
      />
      <div className="col-span-2 rounded-md border bg-background/50 p-2">
        <div className="text-xs text-muted-foreground">Ratio R:R</div>
        <div className="metric-mono text-sm font-semibold">{preview.riskRewardRatio}</div>
      </div>
    </div>
  );
}

function ChallengeRiskPreflightPanel({
  preflight,
  currentCapitalAllocation,
  currentGridCount,
  onApplySafeCapital,
  onApplyRecommendedOrders,
}: {
  preflight: ChallengeRiskPreflight | null;
  currentCapitalAllocation: string;
  currentGridCount: number;
  onApplySafeCapital: () => void;
  onApplyRecommendedOrders: () => void;
}) {
  const canApplySafeCapital =
    preflight &&
    Number(preflight.recommendedCapitalAllocation) > 0 &&
    preflight.recommendedCapitalAllocation !== currentCapitalAllocation;
  const canApplyRecommendedOrders =
    preflight &&
    Number.isFinite(preflight.recommendedGridOrders) &&
    preflight.recommendedGridOrders > 0 &&
    preflight.recommendedGridOrders !== currentGridCount;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-primary" />
          Challenge risk preflight
        </div>
        <div
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium",
            !preflight && "border-muted-foreground/30 text-muted-foreground",
            preflight?.status === "pass" && "border-primary/30 bg-primary/10 text-primary",
            preflight?.status === "warning" && "border-amber-300/40 bg-amber-300/10 text-amber-100",
            preflight &&
              (preflight.status === "blocked" || preflight.status === "invalid") &&
              "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {preflight
            ? preflight.status === "pass"
              ? "PASS"
              : preflight.status === "warning"
                ? "WARN"
                : "BLOCKED"
            : "SYNCING"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PreviewMetric label="SL risk + buffer" value={`$${preflight?.candidateWorstCase ?? "..."}`} tone="destructive" />
        <PreviewMetric label="Risk left" value={`$${preflight?.remainingBudget ?? "..."}`} tone="primary" />
        <PreviewMetric label="Daily left" value={`$${preflight?.dailyRemaining ?? "..."}`} />
        <PreviewMetric label="Drawdown left" value={`$${preflight?.drawdownRemaining ?? "..."}`} />
        <PreviewMetric label="Auto order size" value={`$${preflight?.candidateAutoOrderSize ?? "..."}`} />
        <PreviewMetric label="Entry orders" value={preflight ? String(preflight.candidateEntryOrderCount) : "..."} />
        <PreviewMetric
          label="Daily status"
          value={preflight ? preflight.dailyStatus.toUpperCase() : "..."}
          tone={preflight?.dailyStatus === "safe" ? "primary" : "destructive"}
        />
        <PreviewMetric label="Daily floor" value={`$${preflight?.dailyStopFloor ?? "..."}`} />
      </div>

      <div className="mt-3 rounded-md border bg-background/50 p-2 text-xs text-muted-foreground">
        <div>
          Open bot risk already committed:{" "}
          <span className="metric-mono text-foreground">${preflight?.committedWorstCase ?? "..."}</span>
        </div>
        <div className="mt-1">
          Daily safety stop:{" "}
          <span className="metric-mono text-foreground">
            {preflight?.dailyStopPct ?? "..."}% / ${preflight?.dailyStopAmount ?? "..."}
          </span>
        </div>
        <div className="mt-1">
          Raw SL loss + buffer:{" "}
          <span className="metric-mono text-foreground">
            ${preflight?.candidateLossToStop ?? "..."} + ${preflight?.candidateStopBuffer ?? "..."}
          </span>
        </div>
        <div className="mt-1 border-t pt-2">
          Risk model:{" "}
          <span className="metric-mono text-foreground">
            Pavg {preflight?.recommendedAverageGridPrice ?? "..."} / D{" "}
            {preflight?.recommendedDrawdownToStopPct ?? "..."}%
          </span>
        </div>
        <div className="mt-1">
          Recommended grid:{" "}
          <span className="metric-mono text-foreground">
            ${preflight?.recommendedCapitalAllocation ?? "..."} margin / $
            {preflight?.recommendedRiskSizedNotional ?? "..."} notional /{" "}
            {preflight?.recommendedGridOrders ?? "..."} orders
          </span>
        </div>
        <div className="mt-1">
          Min spacing:{" "}
          <span className="metric-mono text-foreground">{preflight?.recommendedSpacingMinPct ?? "..."}%</span>
        </div>
        {preflight?.blockers[0] ? <div className="mt-1 text-destructive">{preflight.blockers[0]}</div> : null}
        {!preflight?.blockers[0] && preflight?.warnings[0] ? (
          <div className="mt-1 text-amber-100">{preflight.warnings[0]}</div>
        ) : null}
      </div>

      {canApplySafeCapital ? (
        <Button type="button" variant="outline" className="mt-3 w-full" onClick={onApplySafeCapital}>
          Apply risk formula: {preflight.recommendedCapitalAllocation} USDC
        </Button>
      ) : null}

      {canApplyRecommendedOrders ? (
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={onApplyRecommendedOrders}>
          Apply spacing formula: {preflight.recommendedGridOrders} orders
        </Button>
      ) : null}

      {canApplySafeCapital ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Based on 1% accepted challenge risk and the configured stop beyond the grid.
        </div>
      ) : null}
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "destructive";
}) {
  return (
    <div className="rounded-md border bg-background/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "metric-mono text-sm font-semibold",
          tone === "primary" && "text-primary",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function GridRangeVisual({ config, markPrice }: { config: GridConfig; markPrice?: string }) {
  const lower = safeNumber(config.lowerPrice);
  const upper = safeNumber(config.upperPrice);
  const stopLoss = safeNumber(config.stopLoss);
  const takeProfit = safeNumber(config.takeProfit);
  const mark = safeNumber(markPrice);
  const bounds = [lower, upper, stopLoss, takeProfit, mark].filter((value): value is number => Number.isFinite(value));

  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower || bounds.length < 2) return null;

  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
  const span = max - min || 1;
  const position = (value: number) => Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const lowerPct = position(lower);
  const upperPct = position(upper);
  const rangeWidth = Math.max(2, upperPct - lowerPct);
  const takeProfitTone = config.positionSide === "long" ? "primary" : "amber";

  return (
    <div className="rounded-lg border bg-background/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Range map</span>
        {mark ? <span className="metric-mono">Mark {formatCompactPrice(mark)}</span> : null}
      </div>
      <div className="relative h-16">
        <div className="absolute left-0 right-0 top-7 h-1.5 rounded-full bg-muted" />
        <div
          className="absolute top-[25px] h-2.5 rounded-full border border-primary/30"
          style={{
            left: `${lowerPct}%`,
            width: `${rangeWidth}%`,
            background:
              "repeating-linear-gradient(90deg, color-mix(in oklch, var(--primary) 55%, transparent) 0 2px, color-mix(in oklch, var(--chart-3) 55%, transparent) 2px 4px, transparent 4px 8px)",
          }}
        />
        <RangeMarker label="L" value={lower} left={lowerPct} tone="muted" />
        <RangeMarker label="U" value={upper} left={upperPct} tone="muted" />
        {stopLoss ? <RangeMarker label="SL" value={stopLoss} left={position(stopLoss)} tone="destructive" /> : null}
        {takeProfit ? <RangeMarker label="TP" value={takeProfit} left={position(takeProfit)} tone={takeProfitTone} /> : null}
        {mark ? <RangeMarker label="M" value={mark} left={position(mark)} tone="mark" /> : null}
      </div>
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span className="metric-mono">{formatCompactPrice(min)}</span>
        <span className="metric-mono">{formatCompactPrice(max)}</span>
      </div>
    </div>
  );
}

function RangeMarker({
  label,
  value,
  left,
  tone,
}: {
  label: string;
  value: number;
  left: number;
  tone: "primary" | "destructive" | "amber" | "muted" | "mark";
}) {
  return (
    <div
      className="absolute top-1 flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: `${left}%` }}
      title={`${label} ${formatCompactPrice(value)}`}
    >
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
          tone === "primary" && "bg-primary text-primary-foreground",
          tone === "destructive" && "bg-destructive text-foreground",
          tone === "amber" && "bg-chart-3 text-background",
          tone === "muted" && "bg-muted text-muted-foreground",
          tone === "mark" && "bg-chart-2 text-background",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "h-8 w-px",
          tone === "primary" && "bg-primary",
          tone === "destructive" && "bg-destructive",
          tone === "amber" && "bg-chart-3",
          tone === "muted" && "bg-muted-foreground/50",
          tone === "mark" && "bg-chart-2",
        )}
      />
    </div>
  );
}

function ChallengeAccountSummary({
  challenge,
  activeBot,
}: {
  challenge?: ProprChallengeSummary;
  activeBot?: ActiveChallengeBotSummary | null;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Propr challenge account</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {challenge?.label ?? "Active challenge"} · {shortAccountId(challenge?.accountId)}
          </div>
        </div>
        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          Challenge
        </span>
      </div>
      {activeBot ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border bg-background/50 p-2">
            <div className="text-muted-foreground">Active bot</div>
            <div className="truncate font-medium" title={activeBot.name}>
              {activeBot.name}
            </div>
          </div>
          <div className="rounded-md border bg-background/50 p-2">
            <div className="text-muted-foreground">Open orders</div>
            <div className="metric-mono font-semibold">
              {activeBot.openOrders} {formatMarketSymbol(activeBot.pair)}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-md border bg-background/50 p-2 text-xs text-muted-foreground">
          No active challenge bot in the local runtime.
        </div>
      )}
    </div>
  );
}

function shortAccountId(accountId?: string | null) {
  if (!accountId) return "not synced";
  const parts = accountId.split(":");
  const id = parts[parts.length - 1] ?? accountId;
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

function DeployPreviewModal({
  open,
  config,
  preflight,
  preview,
  challenge,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  config: GridConfig;
  preflight: ChallengeRiskPreflight | null;
  preview: GridPreview;
  challenge?: ProprChallengeSummary;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const account = challenge?.accountId ?? "No account synced";
  const canConfirm = (preflight?.status === "pass" || preflight?.status === "warning") && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Rocket className="size-4 text-primary" />
              Deploy preview
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Confirms the exact Propr challenge order plan before sending entry orders.
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close deploy preview">
            <X />
          </Button>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <PreviewMetric label="Asset" value={formatMarketPair(config.pair)} />
          <PreviewMetric label="Account" value={account} />
          <PreviewMetric label="Leverage" value={`${config.leverage}x`} />
          <PreviewMetric label="Direction" value={config.positionSide.toUpperCase()} />
          <PreviewMetric label="Entry orders" value={preflight ? String(preflight.candidateEntryOrderCount) : "..."} />
          <PreviewMetric label="Order size" value={`$${preflight?.candidateAutoOrderSize ?? "..."}`} />
          <PreviewMetric label="Entry notional" value={`$${preflight?.candidateTotalEntryNotional ?? preview.totalNotional}`} />
          <PreviewMetric label="Recommended margin" value={`$${preflight?.recommendedCapitalAllocation ?? "..."}`} />
          <PreviewMetric label="Recommended orders" value={preflight ? String(preflight.recommendedGridOrders) : "..."} />
          <PreviewMetric label="Min spacing" value={`${preflight?.recommendedSpacingMinPct ?? "..."}%`} />
          <PreviewMetric label="SL worst case" value={`$${preflight?.candidateWorstCase ?? "..."}`} tone="destructive" />
          <PreviewMetric label="Daily budget left" value={`$${preflight?.dailyRemaining ?? "..."}`} tone="primary" />
          <PreviewMetric label="Daily floor" value={`$${preflight?.dailyStopFloor ?? "..."}`} />
        </div>

        <div className="mx-4 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <div>
            Daily status:{" "}
            <span
              className={cn(
                "metric-mono font-semibold",
                preflight?.dailyStatus === "safe" && "text-primary",
                preflight?.dailyStatus !== "safe" && "text-destructive",
              )}
            >
              {preflight?.dailyStatus.toUpperCase() ?? "..."}
            </span>
          </div>
          <div className="mt-1">
            Propr hard daily limit stays 3%; this bot uses the internal {preflight?.dailyStopPct ?? "2.75"}% safety
            floor.
          </div>
          {preflight?.blockers[0] ? <div className="mt-2 text-destructive">{preflight.blockers[0]}</div> : null}
          {!preflight?.blockers[0] && preflight?.warnings[0] ? (
            <div className="mt-2 text-amber-100">{preflight.warnings[0]}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Review config
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
            <Rocket data-icon="inline-start" />
            {pending ? "Deploying" : "Confirm deploy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function safeNumber(value?: string): number {
  if (!value) return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatCompactPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

export function GridConfigPanel({
  initialConfig,
  marketSnapshots = [],
  challenge,
  activeBot,
}: {
  initialConfig?: GridConfig;
  marketSnapshots?: MarketSnapshot[];
  challenge?: ProprChallengeSummary;
  activeBot?: ActiveChallengeBotSummary | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [challengePreflight, setChallengePreflight] = useState<ChallengeRiskPreflight | null>(null);
  const [deployPreviewOpen, setDeployPreviewOpen] = useState(false);
  const marketDefaultsAppliedRef = useRef(false);
  const initialConfigKeyRef = useRef<string | null>(null);
  const config = useTerminalStore((state) => state.config);
  const liveModeAcknowledged = useTerminalStore((state) => state.liveModeAcknowledged);
  const setSelectedMarket = useTerminalStore((state) => state.setSelectedMarket);
  const updateConfig = useTerminalStore((state) => state.updateConfig);
  const acknowledgeLiveMode = useTerminalStore((state) => state.acknowledgeLiveMode);
  const challengeConfig = useMemo<GridConfig>(() => ({ ...config, mode: "propr_live" }), [config]);
  const issues = validateBotConfig(challengeConfig);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const liveNeedsAcknowledgement = !liveModeAcknowledged;
  const maxLeverage = maxProprLeverageForAsset(challengeConfig.pair);
  const currentMarket = useMemo(
    () => marketSnapshots.find((market) => market.asset === challengeConfig.pair),
    [challengeConfig.pair, marketSnapshots],
  );
  const preview = estimateGridPreview(challengeConfig);
  const livePreflightIssue =
    challengePreflight?.status === "blocked" || challengePreflight?.status === "invalid"
      ? challengePreflight?.blockers[0] ?? "Challenge risk preflight is still syncing."
      : null;
  const livePreflightWarning = challengePreflight?.status === "warning" ? challengePreflight.warnings[0] : null;

  const patch = (patchValue: Partial<GridConfig>) => updateConfig({ ...patchValue, mode: "propr_live" });
  const canSubmit = !blockingIssues.length && !liveNeedsAcknowledgement && !livePreflightIssue && !pending;

  useEffect(() => {
    if (!initialConfig) return;
    const key = JSON.stringify(initialConfig);
    if (initialConfigKeyRef.current === key) return;
    initialConfigKeyRef.current = key;
    marketDefaultsAppliedRef.current = true;
    updateConfig({ ...initialConfig, mode: "propr_live" });
  }, [initialConfig, updateConfig]);

  useEffect(() => {
    if (marketDefaultsAppliedRef.current || !currentMarket?.mid) return;
    marketDefaultsAppliedRef.current = true;
    updateConfig(deriveDefaultGridConfigFromPrice(challengeConfig, currentMarket.mid));
  }, [challengeConfig, currentMarket?.mid, updateConfig]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setChallengePreflight(null);
        const response = await fetch("/api/bots/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: challengeConfig }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { data?: ChallengeRiskPreflight };
        if (!controller.signal.aborted) setChallengePreflight(payload.data ?? null);
      } catch {
        if (!controller.signal.aborted) setChallengePreflight(null);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [challengeConfig]);

  const selectMarket = (market: MarketSymbol) => {
    setSelectedMarket(market);
    const nextMaxLeverage = maxProprLeverageForAsset(market);
    const marketMid = marketSnapshots.find((snapshot) => snapshot.asset === market)?.mid;
    updateConfig(
      deriveDefaultGridConfigFromPrice(
        {
          ...challengeConfig,
          pair: market,
          leverage: clampLeverage(challengeConfig.leverage, nextMaxLeverage),
        },
        marketMid,
      ),
    );
  };
  const selectStrategy = (positionSide: PositionSide) => {
    updateConfig(deriveGridConfigForPositionSide(challengeConfig, positionSide));
  };
  const setLeverage = (value: number) => patch({ leverage: clampLeverage(value, maxLeverage) });
  const applySafeCapital = () => {
    if (!challengePreflight?.recommendedCapitalAllocation) return;
    patch({ capitalAllocation: challengePreflight.recommendedCapitalAllocation });
  };
  const applyRecommendedOrders = () => {
    if (!challengePreflight?.recommendedGridOrders) return;
    patch({ gridCount: challengePreflight.recommendedGridOrders });
  };

  const runPanelAction = (action: () => Promise<void>, fallbackError: string) => {
    setActionError(null);
    startTransition(() => {
      void action().catch((error) => {
        setActionError(error instanceof Error ? error.message : fallbackError);
      });
    });
  };

  const readActionPayload = async (response: Response, fallbackError: string): Promise<{ error?: string }> => {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? fallbackError);
    }
    return payload;
  };

  const submitBotConfig = () => {
    runPanelAction(async () => {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${formatMarketSymbol(challengeConfig.pair)} ${challengeConfig.positionSide.toUpperCase()} Challenge Grid`,
          config: challengeConfig,
          confirmProprChallengeStart: liveModeAcknowledged,
        }),
      });
      await readActionPayload(response, "Unable to save bot.");
      router.refresh();
    }, "Unable to save bot.");
  };

  const confirmDeployFromPreview = () => {
    setDeployPreviewOpen(false);
    submitBotConfig();
  };

  const stopActiveBot = () => {
    if (!activeBot) return;
    runPanelAction(async () => {
      const response = await fetch("/api/bots/active/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeBot.id }),
      });
      await readActionPayload(response, "Unable to stop bot.");
      router.refresh();
    }, "Unable to stop bot.");
  };

  const closeActiveBot = () => {
    if (!activeBot) return;
    const confirmed = window.confirm(
      `Close ${activeBot.name}? This cancels this bot's open orders and sends a reduce-only market order for the bot inventory.`,
    );
    if (!confirmed) return;

    runPanelAction(async () => {
      const response = await fetch("/api/bots/active/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeBot.id }),
      });
      await readActionPayload(response, "Unable to close bot.");
      router.refresh();
    }, "Unable to close bot.");
  };

  const updateActiveBotExitPrices = () => {
    if (!activeBot) return;
    runPanelAction(async () => {
      const response = await fetch(`/api/bots/${activeBot.id}/exit-prices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeProfit: challengeConfig.takeProfit ?? "",
          stopLoss: challengeConfig.stopLoss ?? "",
        }),
      });
      await readActionPayload(response, "Unable to update bot exit levels.");
      router.refresh();
    }, "Unable to update bot exit levels.");
  };

  return (
    <>
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="size-4 text-primary" />
          Grid configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label="Market">
          <Select value={challengeConfig.pair} onValueChange={(value) => selectMarket(value as MarketSymbol)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>{formatMarketPair(challengeConfig.pair)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MARKET_DEFINITIONS.map((market) => (
                  <SelectItem key={market.symbol} value={market.symbol}>
                    {formatMarketPair(market.symbol)} - {market.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Strategy">
          <StrategySelector value={challengeConfig.positionSide} onChange={selectStrategy} />
        </Field>

        <ChallengeAccountSummary challenge={challenge} activeBot={activeBot} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lower price">
            <Input value={challengeConfig.lowerPrice} onChange={(event) => patch({ lowerPrice: event.target.value })} />
          </Field>
          <Field label="Upper price">
            <Input value={challengeConfig.upperPrice} onChange={(event) => patch({ upperPrice: event.target.value })} />
          </Field>
          <Field label="Grid count">
            <Input
              type="number"
              value={challengeConfig.gridCount}
              onChange={(event) => patch({ gridCount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Daily stop %">
            <Input
              value={challengeConfig.challengeDailyLossStopPct}
              onChange={(event) => patch({ challengeDailyLossStopPct: event.target.value })}
            />
          </Field>
          <Field label="Capital">
            <Input
              value={challengeConfig.capitalAllocation}
              onChange={(event) => patch({ capitalAllocation: event.target.value })}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Leverage">
              <LeverageControl max={maxLeverage} value={challengeConfig.leverage} onChange={setLeverage} />
            </Field>
          </div>
        </div>

        <Field label="Spacing">
          <ToggleGroup
            value={[challengeConfig.spacing]}
            onValueChange={(value) => value[0] && patch({ spacing: value[0] as GridConfig["spacing"] })}
            variant="outline"
            size="sm"
            spacing={1}
          >
            <ToggleGroupItem value="arithmetic">Arithmetic</ToggleGroupItem>
            <ToggleGroupItem value="geometric">Geometric</ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Take profit">
            <Input value={challengeConfig.takeProfit ?? ""} onChange={(event) => patch({ takeProfit: event.target.value })} />
          </Field>
          <Field label="Stop loss">
            <Input value={challengeConfig.stopLoss ?? ""} onChange={(event) => patch({ stopLoss: event.target.value })} />
          </Field>
          {activeBot ? (
            <Button className="col-span-2" variant="outline" disabled={pending} onClick={updateActiveBotExitPrices}>
              <ShieldCheck data-icon="inline-start" />
              Save SL / TP for active bot
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div>
            <div className="text-sm font-medium">Auto pause out of range</div>
            <div className="text-xs text-muted-foreground">Required before challenge execution.</div>
          </div>
          <Switch
            checked={challengeConfig.autoPauseOutOfRange}
            onCheckedChange={(checked) => patch({ autoPauseOutOfRange: checked })}
          />
        </div>

        <Field label="Grid preview">
          <div className="flex flex-col gap-2">
            <GridRangeVisual config={challengeConfig} markPrice={currentMarket?.mid} />
            <GridPreviewSummary preview={preview} />
            <ChallengeRiskPreflightPanel
              preflight={challengePreflight}
              currentCapitalAllocation={challengeConfig.capitalAllocation}
              currentGridCount={challengeConfig.gridCount}
              onApplySafeCapital={applySafeCapital}
              onApplyRecommendedOrders={applyRecommendedOrders}
            />
          </div>
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
          <div>
            <div className="text-sm font-medium text-amber-100">Arm challenge deploy</div>
            <div className="text-xs text-amber-100/70">Required before sending orders to the active Propr challenge.</div>
          </div>
          <Switch checked={liveModeAcknowledged} onCheckedChange={acknowledgeLiveMode} />
        </div>

        {blockingIssues.length || liveNeedsAcknowledgement || livePreflightIssue || actionError ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Execution blocked</AlertTitle>
            <AlertDescription>
              {actionError ??
              (liveNeedsAcknowledgement
                ? "Bot deployment requires explicit confirmation."
                : livePreflightIssue ?? blockingIssues[0]?.message)}
            </AlertDescription>
          </Alert>
        ) : null}

        {!liveNeedsAcknowledgement && !blockingIssues.length && !livePreflightIssue && !actionError ? (
          <Alert>
            {livePreflightWarning ? <AlertTriangle className="size-4" /> : <Rocket className="size-4" />}
            <AlertTitle>
              {livePreflightWarning ? "Ready with risk warning" : activeBot ? "Ready to deploy another bot" : "Ready to deploy"}
            </AlertTitle>
            <AlertDescription>
              {livePreflightWarning ??
              (activeBot
                ? "A challenge bot is already active. The preview will re-check remaining risk before sending more entry orders."
                : "This deploys the bot on the active Propr challenge. It opens the initial grid inventory and places both rebuy and reduce-only ladder orders.")}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button className="col-span-2" disabled={!canSubmit} onClick={() => setDeployPreviewOpen(true)}>
            <Rocket data-icon="inline-start" />
            {pending ? "Working" : activeBot ? "Deploy Another" : "Deploy Bot"}
          </Button>
          <Button variant="outline" disabled={pending || !activeBot} onClick={stopActiveBot}>
            <Square data-icon="inline-start" />
            Cancel Orders
          </Button>
          <Button variant="destructive" disabled={pending || !activeBot} onClick={closeActiveBot}>
            <X data-icon="inline-start" />
            Close Bot
          </Button>
        </div>
      </CardContent>
    </Card>
    <DeployPreviewModal
      open={deployPreviewOpen}
      config={challengeConfig}
      preflight={challengePreflight}
      preview={preview}
      challenge={challenge}
      pending={pending}
      onClose={() => setDeployPreviewOpen(false)}
      onConfirm={confirmDeployFromPreview}
    />
    </>
  );
}
