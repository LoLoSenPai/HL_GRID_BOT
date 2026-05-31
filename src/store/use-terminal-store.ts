"use client";

import { create } from "zustand";

import type { GridConfig, MarketSymbol, TradingMode } from "@/domain/types";
import { defaultBotConfig } from "@/features/bots/sample-data";

interface TerminalState {
  selectedMarket: MarketSymbol;
  mode: TradingMode;
  config: GridConfig;
  liveModeAcknowledged: boolean;
  killSwitchActive: boolean;
  setSelectedMarket: (market: MarketSymbol) => void;
  setMode: (mode: TradingMode) => void;
  updateConfig: (patch: Partial<GridConfig>) => void;
  acknowledgeLiveMode: (acknowledged: boolean) => void;
  setKillSwitch: (active: boolean) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  selectedMarket: "BTC",
  mode: "propr_live",
  config: { ...defaultBotConfig, mode: "propr_live" },
  liveModeAcknowledged: false,
  killSwitchActive: false,
  setSelectedMarket: (market) =>
    set((state) => ({
      selectedMarket: market,
      config: { ...state.config, pair: market },
    })),
  setMode: (mode) =>
    set((state) => ({
      mode,
      config: { ...state.config, mode },
    })),
  updateConfig: (patch) =>
    set((state) => ({
      config: { ...state.config, ...patch },
    })),
  acknowledgeLiveMode: (acknowledged) => set({ liveModeAcknowledged: acknowledged }),
  setKillSwitch: (active) => set({ killSwitchActive: active }),
}));
