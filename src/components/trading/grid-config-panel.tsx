"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Play, Plus, Rocket, ShieldCheck, Square, TrendingDown, TrendingUp, X, Zap } from "lucide-react";

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
  type MarketSnapshot,
  type MarketSymbol,
  type PositionSide,
  type TradingMode,
} from "@/domain/types";
import { validateBotConfig } from "@/domain/risk";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/use-terminal-store";

const MODE_DETAILS: Record<TradingMode, { label: string; detail: string }> = {
  mock: {
    label: "Mock",
    detail: "Local dev simulator. No Propr account, useful for UI and adapter checks.",
  },
  paper: {
    label: "Local Sim",
    detail: "Runs locally with Hyperliquid market data. No Propr orders.",
  },
  propr_live: {
    label: "Propr Challenge",
    detail: "Live API, active challenge account. Places initial entry grid orders.",
  },
};

interface ChallengeRiskPreflight {
  status: "pass" | "blocked" | "invalid";
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
  recommendedBudgetUsePct: string;
  blockers: string[];
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
  onApplySafeCapital,
}: {
  preflight: ChallengeRiskPreflight | null;
  currentCapitalAllocation: string;
  onApplySafeCapital: () => void;
}) {
  const canApplySafeCapital =
    preflight &&
    Number(preflight.recommendedCapitalAllocation) > 0 &&
    preflight.recommendedCapitalAllocation !== currentCapitalAllocation;

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
            preflight?.status !== "pass" && preflight && "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {preflight ? (preflight.status === "pass" ? "PASS" : "BLOCKED") : "SYNCING"}
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
        {preflight?.blockers[0] ? <div className="mt-1 text-destructive">{preflight.blockers[0]}</div> : null}
      </div>

      {preflight?.status !== "pass" && canApplySafeCapital ? (
        <Button type="button" variant="outline" className="mt-3 w-full" onClick={onApplySafeCapital}>
          Apply safe capital: {preflight.recommendedCapitalAllocation} USDC
        </Button>
      ) : null}

      {preflight?.status !== "pass" && canApplySafeCapital ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Uses {preflight.recommendedBudgetUsePct}% of the remaining challenge risk budget.
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

function ModeHint({ mode }: { mode: TradingMode }) {
  const details = MODE_DETAILS[mode];

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-sm font-medium">{details.label}</div>
      <div className="text-xs text-muted-foreground">{details.detail}</div>
    </div>
  );
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
  const canConfirm = preflight?.status === "pass" && !pending;

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
  marketSnapshots = [],
  challenge,
}: {
  marketSnapshots?: MarketSnapshot[];
  challenge?: ProprChallengeSummary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [challengePreflight, setChallengePreflight] = useState<ChallengeRiskPreflight | null>(null);
  const [deployPreviewOpen, setDeployPreviewOpen] = useState(false);
  const marketDefaultsAppliedRef = useRef(false);
  const config = useTerminalStore((state) => state.config);
  const mode = useTerminalStore((state) => state.mode);
  const liveModeAcknowledged = useTerminalStore((state) => state.liveModeAcknowledged);
  const setSelectedMarket = useTerminalStore((state) => state.setSelectedMarket);
  const setMode = useTerminalStore((state) => state.setMode);
  const updateConfig = useTerminalStore((state) => state.updateConfig);
  const acknowledgeLiveMode = useTerminalStore((state) => state.acknowledgeLiveMode);
  const issues = validateBotConfig(config);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const liveNeedsAcknowledgement = mode === "propr_live" && !liveModeAcknowledged;
  const liveCandidateMode = mode === "propr_live";
  const maxLeverage = maxProprLeverageForAsset(config.pair);
  const currentMarket = useMemo(
    () => marketSnapshots.find((market) => market.asset === config.pair),
    [config.pair, marketSnapshots],
  );
  const preview = estimateGridPreview(config);
  const livePreflightIssue =
    mode === "propr_live" && challengePreflight?.status !== "pass"
      ? challengePreflight?.blockers[0] ?? "Challenge risk preflight is still syncing."
      : null;

  const patch = (patchValue: Partial<GridConfig>) => updateConfig(patchValue);
  const canSubmit = !blockingIssues.length && !liveNeedsAcknowledgement && !livePreflightIssue && !pending;

  useEffect(() => {
    if (marketDefaultsAppliedRef.current || !currentMarket?.mid) return;
    marketDefaultsAppliedRef.current = true;
    updateConfig(deriveDefaultGridConfigFromPrice(config, currentMarket.mid));
  }, [config, currentMarket?.mid, updateConfig]);

  useEffect(() => {
    if (mode !== "propr_live") return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setChallengePreflight(null);
        const response = await fetch("/api/bots/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
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
  }, [config, mode]);

  const selectMarket = (market: MarketSymbol) => {
    setSelectedMarket(market);
    const nextMaxLeverage = maxProprLeverageForAsset(market);
    const marketMid = marketSnapshots.find((snapshot) => snapshot.asset === market)?.mid;
    updateConfig(
      deriveDefaultGridConfigFromPrice(
        {
          ...config,
          pair: market,
          leverage: clampLeverage(config.leverage, nextMaxLeverage),
        },
        marketMid,
      ),
    );
  };
  const selectStrategy = (positionSide: PositionSide) => {
    updateConfig(deriveGridConfigForPositionSide(config, positionSide));
  };
  const setLeverage = (value: number) => patch({ leverage: clampLeverage(value, maxLeverage) });
  const applySafeCapital = () => {
    if (!challengePreflight?.recommendedCapitalAllocation) return;
    patch({ capitalAllocation: challengePreflight.recommendedCapitalAllocation });
  };

  const submitBotConfig = () => {
    setActionError(null);
    startTransition(async () => {
      const modeName = mode === "propr_live" ? "Challenge" : mode === "mock" ? "Mock" : "Local Sim";
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${formatMarketSymbol(config.pair)} ${config.positionSide.toUpperCase()} ${modeName} Grid`,
          config,
          confirmProprChallengeStart: mode === "propr_live" && liveModeAcknowledged,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setActionError(payload.error ?? "Unable to save bot.");
        return;
      }
      router.refresh();
    });
  };

  const confirmDeployFromPreview = () => {
    setDeployPreviewOpen(false);
    submitBotConfig();
  };

  const stopActiveBot = () => {
    setActionError(null);
    startTransition(async () => {
      const response = await fetch("/api/bots/active/stop", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setActionError(payload.error ?? "Unable to stop bot.");
        return;
      }
      router.refresh();
    });
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
          <Select value={config.pair} onValueChange={(value) => selectMarket(value as MarketSymbol)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>{formatMarketPair(config.pair)}</SelectValue>
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
          <StrategySelector value={config.positionSide} onChange={selectStrategy} />
        </Field>

        <Field label="Mode">
          <div className="flex flex-col gap-2">
            <ToggleGroup
              value={[mode]}
              onValueChange={(value) => value[0] && setMode(value[0] as TradingMode)}
              variant="outline"
              size="sm"
              spacing={1}
            >
              <ToggleGroupItem value="mock">Mock</ToggleGroupItem>
              <ToggleGroupItem value="paper">Local Sim</ToggleGroupItem>
              <ToggleGroupItem value="propr_live">Challenge</ToggleGroupItem>
            </ToggleGroup>
            <ModeHint mode={mode} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lower price">
            <Input value={config.lowerPrice} onChange={(event) => patch({ lowerPrice: event.target.value })} />
          </Field>
          <Field label="Upper price">
            <Input value={config.upperPrice} onChange={(event) => patch({ upperPrice: event.target.value })} />
          </Field>
          <Field label="Grid count">
            <Input
              type="number"
              value={config.gridCount}
              onChange={(event) => patch({ gridCount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Daily stop %">
            <Input
              value={config.challengeDailyLossStopPct}
              onChange={(event) => patch({ challengeDailyLossStopPct: event.target.value })}
            />
          </Field>
          <Field label="Capital">
            <Input
              value={config.capitalAllocation}
              onChange={(event) => patch({ capitalAllocation: event.target.value })}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Leverage">
              <LeverageControl max={maxLeverage} value={config.leverage} onChange={setLeverage} />
            </Field>
          </div>
        </div>

        <Field label="Spacing">
          <ToggleGroup
            value={[config.spacing]}
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
            <Input value={config.takeProfit ?? ""} onChange={(event) => patch({ takeProfit: event.target.value })} />
          </Field>
          <Field label="Stop loss">
            <Input value={config.stopLoss ?? ""} onChange={(event) => patch({ stopLoss: event.target.value })} />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
          <div>
            <div className="text-sm font-medium">Auto pause out of range</div>
            <div className="text-xs text-muted-foreground">Required before live execution.</div>
          </div>
          <Switch
            checked={config.autoPauseOutOfRange}
            onCheckedChange={(checked) => patch({ autoPauseOutOfRange: checked })}
          />
        </div>

        <Field label="Grid preview">
          <div className="flex flex-col gap-2">
            <GridRangeVisual config={config} markPrice={currentMarket?.mid} />
            <GridPreviewSummary preview={preview} />
            {mode === "propr_live" ? (
              <ChallengeRiskPreflightPanel
                preflight={challengePreflight}
                currentCapitalAllocation={config.capitalAllocation}
                onApplySafeCapital={applySafeCapital}
              />
            ) : null}
          </div>
        </Field>

        {mode === "propr_live" ? (
          <div className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
            <div>
              <div className="text-sm font-medium text-amber-100">Deploy confirmation</div>
              <div className="text-xs text-amber-100/70">Deploys this bot on the active challenge account.</div>
            </div>
            <Switch checked={liveModeAcknowledged} onCheckedChange={acknowledgeLiveMode} />
          </div>
        ) : null}

        {blockingIssues.length || liveNeedsAcknowledgement || actionError ? (
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

        {liveCandidateMode && !liveNeedsAcknowledgement && !blockingIssues.length && !livePreflightIssue && !actionError ? (
          <Alert>
            <Rocket className="size-4" />
            <AlertTitle>Ready to deploy</AlertTitle>
            <AlertDescription>
              This deploys the bot on the active Propr challenge. Entry orders are placed first; Sync Propr adds
              reduce-only exit orders after fills.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!canSubmit} onClick={liveCandidateMode ? () => setDeployPreviewOpen(true) : submitBotConfig}>
            {liveCandidateMode ? <Rocket data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {pending ? "Working" : liveCandidateMode ? "Deploy Bot" : `Start ${config.positionSide.toUpperCase()}`}
          </Button>
          <Button variant="outline" disabled={pending} onClick={stopActiveBot}>
            <Square data-icon="inline-start" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
    <DeployPreviewModal
      open={deployPreviewOpen}
      config={config}
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
