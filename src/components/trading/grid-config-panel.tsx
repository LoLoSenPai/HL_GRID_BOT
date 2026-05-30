"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Play, Plus, Rocket, Square, Zap } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SUPPORTED_MARKETS, type GridConfig, type MarketSymbol, type TradingMode } from "@/domain/types";
import { validateBotConfig } from "@/domain/risk";
import { useTerminalStore } from "@/store/use-terminal-store";

const MAX_LEVERAGE_BY_MARKET: Record<MarketSymbol, number> = {
  BTC: 5,
  ETH: 5,
  SOL: 2,
  HYPE: 2,
};

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

export function GridConfigPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
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
  const maxLeverage = MAX_LEVERAGE_BY_MARKET[config.pair];

  const patch = (patchValue: Partial<GridConfig>) => updateConfig(patchValue);
  const canSubmit = !blockingIssues.length && !liveNeedsAcknowledgement && !pending;
  const selectMarket = (market: MarketSymbol) => {
    setSelectedMarket(market);
    const nextMaxLeverage = MAX_LEVERAGE_BY_MARKET[market];
    if (config.leverage > nextMaxLeverage) {
      patch({ leverage: nextMaxLeverage });
    }
  };
  const setLeverage = (value: number) => patch({ leverage: clampLeverage(value, maxLeverage) });

  const submitBotConfig = () => {
    setActionError(null);
    startTransition(async () => {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${config.pair} ${mode === "mock" ? "Mock" : "Paper"} Grid`,
          config,
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SUPPORTED_MARKETS.map((market) => (
                  <SelectItem key={market} value={market}>
                    {market}/USDC
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Mode">
          <ToggleGroup
            value={[mode]}
            onValueChange={(value) => value[0] && setMode(value[0] as TradingMode)}
            variant="outline"
            size="sm"
            spacing={1}
          >
            <ToggleGroupItem value="mock">Mock</ToggleGroupItem>
            <ToggleGroupItem value="paper">Paper</ToggleGroupItem>
            <ToggleGroupItem value="propr_live">Propr Live</ToggleGroupItem>
          </ToggleGroup>
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
          <Field label="Order size">
            <Input value={config.orderSize} onChange={(event) => patch({ orderSize: event.target.value })} />
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

        {mode === "propr_live" ? (
          <div className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
            <div>
              <div className="text-sm font-medium text-amber-100">Live confirmation</div>
              <div className="text-xs text-amber-100/70">Creates a separate candidate and places no orders.</div>
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
                ? "Propr Live candidate creation requires explicit confirmation."
                : blockingIssues[0]?.message)}
            </AlertDescription>
          </Alert>
        ) : null}

        {liveCandidateMode && !liveNeedsAcknowledgement && !blockingIssues.length && !actionError ? (
          <Alert>
            <Rocket className="size-4" />
            <AlertTitle>Candidate only</AlertTitle>
            <AlertDescription>
              This will save a Propr Live bot profile. Live order placement remains disabled until guarded execution is
              implemented.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!canSubmit} onClick={submitBotConfig}>
            {liveCandidateMode ? <Rocket data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {pending ? "Working" : liveCandidateMode ? "Create candidate" : "Start"}
          </Button>
          <Button variant="outline" disabled={pending} onClick={stopActiveBot}>
            <Square data-icon="inline-start" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
