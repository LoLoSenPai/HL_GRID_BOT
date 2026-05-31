"use client";

import { useEffect, useRef, useState } from "react";

import { TerminalChart } from "@/components/charts/terminal-chart";
import type { GridConfig } from "@/domain/types";
import type { Candle } from "@/features/market-data/types";
import { useTerminalStore } from "@/store/use-terminal-store";

export function ReactiveTerminalChart({
  initialConfig,
  candles,
}: {
  initialConfig: GridConfig;
  candles: Candle[];
}) {
  const initializedRef = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const config = useTerminalStore((state) => state.config);
  const updateConfig = useTerminalStore((state) => state.updateConfig);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    updateConfig(initialConfig);
    setInitialized(true);
  }, [initialConfig, updateConfig]);

  return <TerminalChart config={initialized ? config : initialConfig} candles={candles} />;
}
