"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineStyle,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
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

const INITIAL_VISIBLE_BARS = 140;
const RIGHT_OFFSET_BARS = 10;

export interface ChartOrder {
  id: string;
  side: "buy" | "sell";
  status: string;
  quantity: string;
  price?: string | null;
  reduceOnly: boolean;
}

export interface ChartPositionLine {
  positionSide: "long" | "short";
  quantity: string;
  entryPrice: string;
  unrealizedPnl: string;
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

export function TerminalChart({
  config,
  candles: inputCandles,
  orders = [],
  className = "",
  livePrice,
  position,
}: {
  config: GridConfig;
  candles?: Candle[];
  orders?: ChartOrder[];
  className?: string;
  livePrice?: string;
  position?: ChartPositionLine;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const gridSeriesRef = useRef<Array<ISeriesApi<"Line">>>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastCandleRef = useRef<ChartCandle | null>(null);
  const visibleRangePairRef = useRef<GridConfig["pair"] | null>(null);
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
        barSpacing: 7,
        minBarSpacing: 2,
        rightOffset: RIGHT_OFFSET_BARS,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        timeVisible: true,
      },
      handleScroll: true,
      handleScale: true,
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
    candleSeriesRef.current = candleSeries;
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
      candleSeriesRef.current = null;
      gridSeriesRef.current = [];
      priceLinesRef.current = [];
      lastCandleRef.current = null;
      visibleRangePairRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || !candles.length) return;

    candleSeries.setData(candles);
    lastCandleRef.current = candles.at(-1) ?? null;

    if (visibleRangePairRef.current !== config.pair) {
      visibleRangePairRef.current = config.pair;
      setInitialVisibleRange(chart, candles.length);
    }
  }, [candles, config.pair]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length < 2) return;

    for (const series of gridSeriesRef.current) {
      chart.removeSeries(series);
    }
    gridSeriesRef.current = [];

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
      gridSeriesRef.current.push(line);
    }
  }, [candles, levels]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    priceLinesRef.current = [];

    const visibleOrders = orders
      .filter((order) => order.status === "open" && Number.isFinite(Number(order.price)))
      .sort((a, b) => Number(b.price) - Number(a.price))
      .slice(0, 60);

    for (const order of visibleOrders) {
      const price = Number(order.price);
      const color = order.reduceOnly
        ? "rgba(168, 85, 247, 0.95)"
        : order.side === "buy"
          ? "rgba(59, 130, 246, 0.95)"
          : "rgba(217, 119, 6, 0.95)";
      const line = candleSeries.createPriceLine({
        price,
        color,
        lineWidth: order.reduceOnly ? 2 : 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: orderLabel(order),
      });
      priceLinesRef.current.push(line);
    }

    const entryPrice = Number(position?.entryPrice);
    if (position && Number.isFinite(entryPrice) && entryPrice > 0) {
      const line = candleSeries.createPriceLine({
        price: entryPrice,
        color: position.positionSide === "short" ? "rgba(248, 113, 113, 0.95)" : "rgba(71, 209, 140, 0.95)",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Entry ${position.positionSide} ${compactQuantity(position.quantity)} uPnL ${signedCompact(position.unrealizedPnl)}`,
      });
      priceLinesRef.current.push(line);
    }
  }, [orders, position]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const lastCandle = lastCandleRef.current;
    const price = Number(livePrice);
    if (!series || !lastCandle || !Number.isFinite(price) || price <= 0) return;

    const currentBucket = (Math.floor(Date.now() / 1000 / 900) * 900) as UTCTimestamp;
    const nextCandle =
      Number(lastCandle.time) >= Number(currentBucket)
        ? {
            ...lastCandle,
            high: Math.max(lastCandle.high, price),
            low: Math.min(lastCandle.low, price),
            close: price,
          }
        : {
            time: currentBucket,
            open: lastCandle.close,
            high: Math.max(lastCandle.close, price),
            low: Math.min(lastCandle.close, price),
            close: price,
          };

    series.update(nextCandle);
    lastCandleRef.current = nextCandle;
  }, [livePrice]);

  return <div ref={containerRef} className={`h-full min-h-[260px] w-full ${className}`} />;
}

function setInitialVisibleRange(chart: IChartApi, candleCount: number) {
  if (candleCount <= 0) return;

  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, candleCount - INITIAL_VISIBLE_BARS),
    to: candleCount + RIGHT_OFFSET_BARS,
  });
}

function orderLabel(order: ChartOrder): string {
  const action = order.reduceOnly ? "TP" : "Limit";
  return `${action} ${order.side} ${compactQuantity(order.quantity)}`;
}

function compactQuantity(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (numeric >= 1) return numeric.toFixed(2).replace(/\.?0+$/, "");
  return numeric.toPrecision(4);
}

function signedCompact(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}`;
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
