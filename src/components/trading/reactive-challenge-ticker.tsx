"use client";

import { decimal, toDecimalString } from "@/domain/decimal";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { useTerminalLiveSnapshot, type TerminalLiveSnapshot } from "@/components/trading/terminal-live-feed";

export function ReactiveChallengeTicker({
  initialChallenge,
  initialSnapshot,
}: {
  initialChallenge: ProprChallengeSummary;
  initialSnapshot: TerminalLiveSnapshot;
}) {
  const snapshot = useTerminalLiveSnapshot(initialSnapshot);
  const challenge = snapshot?.challenge ?? initialChallenge;
  const netPnl = challengeNetPnl(challenge);
  const toTarget = positiveDifference(challenge.profitTarget, netPnl);
  const dailyLossUsed = lossUsed(challenge.dayStartEquity, challenge.equity);
  const drawdownPct = drawdownPctOfStartingBalance(challenge);
  const sourceLabel = challenge.source === "propr_live" ? "Live API" : "Fallback";
  const profitTone = Number(challenge.profitProgressPct) < 0 ? "down" : "up";

  return (
    <div className="border-b bg-amber-500/8 px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-sm bg-amber-400/20 px-2 py-1 text-[11px] font-semibold text-amber-200">
            {challenge.label}
          </span>
          <span className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
            {sourceLabel}
          </span>
        </div>
        <TickerMetric label="Balance" value={`$${challenge.balance}`} />
        <TickerMetric label="Equity" value={`$${challenge.equity}`} />
        <TickerMetric label="Available" value={challenge.availableBalance ? `$${challenge.availableBalance}` : "n/a"} tone="up" />
        <TickerMetric label="Drawdown Used" value={`${drawdownPct}% / ${challenge.ruleSet.maxDrawdownPct}%`} />
        <TickerMetric label="Daily Loss" value={`$${dailyLossUsed} / $${challenge.dailyLossLimit}`} />
        <TickerMetric label="Profit Target" value={`${challenge.profitProgressPct}% / ${challenge.ruleSet.profitTargetPct}%`} tone={profitTone} />
        <TickerMetric label="To Target" value={`$${toTarget}`} tone="up" />
        <ProgressChip label="Daily" value={challenge.dailyLossUsedPct} />
        <ProgressChip label="DD" value={challenge.drawdownUsedPct} />
      </div>
    </div>
  );
}

function TickerMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className={["metric-mono font-semibold", tone === "up" ? "text-primary" : "", tone === "down" ? "text-destructive" : ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function ProgressChip({ label, value }: { label: string; value: string }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = pct >= 80 ? "bg-destructive" : pct >= 55 ? "bg-amber-400" : "bg-primary";

  return (
    <div className="flex min-w-[92px] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="metric-mono text-muted-foreground">{value}%</span>
    </div>
  );
}

function positiveDifference(target: string, current: string): string {
  try {
    const difference = decimal(target).minus(current);
    return toDecimalString(difference.gt(0) ? difference : 0, 2);
  } catch {
    return "0";
  }
}

function challengeNetPnl(challenge: ProprChallengeSummary): string {
  try {
    return toDecimalString(decimal(challenge.equity).minus(challenge.startingBalance), 2);
  } catch {
    return "0";
  }
}

function drawdownPctOfStartingBalance(challenge: ProprChallengeSummary): string {
  try {
    const used = decimal(challenge.highWaterMark).minus(challenge.equity);
    const positiveUsed = used.gt(0) ? used : decimal(0);
    return toDecimalString(positiveUsed.div(challenge.startingBalance).mul(100), 2);
  } catch {
    return "0";
  }
}

function lossUsed(reference: string, current: string): string {
  try {
    const difference = decimal(reference).minus(current);
    return toDecimalString(difference.gt(0) ? difference : 0, 2);
  } catch {
    return "0";
  }
}
