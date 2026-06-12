"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { generateGridLevels } from "@/domain/grid";
import type { GridConfig } from "@/domain/types";
import type { Candle } from "@/features/market-data/types";

interface ChartCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

function buildCandles(reference: number): ChartCandle[] {
  const safeReference = Number.isFinite(reference) && reference > 0 ? reference : 1;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: 80 }, (_, index) => {
    const time = (now - (80 - index) * 900) as UTCTimestamp;
    const wave = Math.sin(index / 6) * safeReference * 0.012;
    const drift = (index - 40) * safeReference * 0.00018;
    const open = safeReference + wave + drift;
    const close = open + Math.cos(index / 5) * safeReference * 0.004;
    return {
      time,
      open,
      high: Math.max(open, close) + safeReference * 0.006,
      low: Math.min(open, close) - safeReference * 0.006,
      close,
    };
  });
}

function normalizeCandles(candles: Candle[] | undefined, reference: number): ChartCandle[] {
  const normalized =
    candles
      ?.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      }))
      .filter((candle) =>
        [candle.time, candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value)),
      )
      .sort((a, b) => Number(a.time) - Number(b.time)) ?? [];

  return normalized.length >= 2 ? normalized : buildCandles(reference);
}

export function TerminalChart({ config, candles: inputCandles }: { config: GridConfig; candles?: Candle[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const reference = resolveReference(config, inputCandles);
  const candles = useMemo(() => normalizeCandles(inputCandles, reference), [inputCandles, reference]);
  const levels = useMemo(() => safeGenerateGridLevels(config, reference), [config, reference]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(229, 231, 235, 0.72)",
        fontFamily: "Geist, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.12)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: "rgba(125, 211, 252, 0.35)" },
        horzLine: { color: "rgba(125, 211, 252, 0.35)" },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#47d18c",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#47d18c",
      wickDownColor: "#f87171",
    });
    candleSeries.setData(candles);

    for (const level of levels) {
      const line = chart.addSeries(LineSeries, {
        color: level.side === "buy" ? "rgba(71, 209, 140, 0.4)" : "rgba(248, 183, 71, 0.4)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line.setData([
        { time: candles[0].time, value: Number(level.price) },
        { time: candles[candles.length - 1].time, value: Number(level.price) },
      ]);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const resize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, levels]);

  return <div ref={containerRef} className="h-[440px] min-h-[320px] w-full" />;
}

function resolveReference(config: GridConfig, inputCandles?: Candle[]): number {
  const lower = Number(config.lowerPrice);
  const upper = Number(config.upperPrice);
  if (Number.isFinite(lower) && Number.isFinite(upper) && upper > lower) {
    return lower + (upper - lower) / 2;
  }

  const lastClose = Number(inputCandles?.at(-1)?.close);
  if (Number.isFinite(lastClose) && lastClose > 0) return lastClose;

  return 1;
}

function safeGenerateGridLevels(config: GridConfig, reference: number) {
  if (!Number.isFinite(reference) || reference <= 0) return [];

  try {
    return generateGridLevels(config, String(reference)).filter((level) => Number.isFinite(Number(level.price)));
  } catch {
    return [];
  }
}
