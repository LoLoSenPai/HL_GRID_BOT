"use client";

import { useEffect, useState } from "react";

import type { MarketSnapshot } from "@/domain/types";
import type { BotPerformanceSummary } from "@/features/bots/performance";
import type { ExecutionPosition } from "@/features/execution/types";
import type { ProprChallengeSummary } from "@/features/propr/challenge-summary";

export interface TerminalLiveSnapshot {
  checkedAt: string;
  markets: MarketSnapshot[];
  challenge: ProprChallengeSummary;
  bots: BotPerformanceSummary[];
  livePositions: ExecutionPosition[];
}

const subscribers = new Set<(snapshot: TerminalLiveSnapshot) => void>();

let cache: TerminalLiveSnapshot | null = null;
let timer: number | null = null;
let inFlight = false;

export function useTerminalLiveSnapshot(initialSnapshot?: TerminalLiveSnapshot) {
  const [snapshot, setSnapshot] = useState<TerminalLiveSnapshot | null>(initialSnapshot ?? null);

  useEffect(() => {
    subscribers.add(setSnapshot);
    if (initialSnapshot) {
      cache = initialSnapshot;
      window.queueMicrotask(() => {
        if (subscribers.has(setSnapshot) && cache) setSnapshot(cache);
      });
    } else if (cache) {
      window.queueMicrotask(() => {
        if (subscribers.has(setSnapshot) && cache) setSnapshot(cache);
      });
    }
    startTerminalLiveFeed();

    return () => {
      subscribers.delete(setSnapshot);
      if (!subscribers.size) stopTerminalLiveFeed();
    };
  }, [initialSnapshot]);

  return snapshot;
}

function startTerminalLiveFeed() {
  if (timer !== null) return;
  void loadTerminalLiveSnapshot();
  timer = window.setInterval(() => void loadTerminalLiveSnapshot(), 5000);
}

function stopTerminalLiveFeed() {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
}

async function loadTerminalLiveSnapshot() {
  if (inFlight) return;
  inFlight = true;
  try {
    const response = await fetch("/api/terminal/live", { cache: "no-store" });
    const payload = (await response.json()) as { data?: TerminalLiveSnapshot };
    if (!response.ok || !payload.data) return;
    cache = payload.data;
    for (const subscriber of subscribers) subscriber(payload.data);
  } finally {
    inFlight = false;
  }
}
