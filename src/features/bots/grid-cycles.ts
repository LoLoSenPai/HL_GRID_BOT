import { decimal, toDecimalString, type Decimal } from "@/domain/decimal";
import { generateGridPrices } from "@/domain/grid";
import type { Bot, GridConfig, OrderSide } from "@/domain/types";
import type { PersistedFill, PersistedOrder } from "@/features/bots/repository";

export type GridCycleStatus = "closed" | "open" | "unmatched_exit";
export type GridCycleSource = "grid" | "initial_inventory";

export interface GridCycleRow {
  id: string;
  status: GridCycleStatus;
  source: GridCycleSource;
  band: string;
  asset: string;
  positionSide: "long" | "short";
  entrySide?: OrderSide;
  exitSide?: OrderSide;
  entryPrice?: string;
  exitPrice?: string;
  targetExitPrice?: string;
  quantity: string;
  grossPnl: string;
  fees: string;
  netPnl: string;
  entryAt?: string;
  exitAt?: string;
  entryGridLevelId?: string | null;
  exitGridLevelId?: string | null;
}

export interface GridCycleReport {
  botId: string;
  generatedAt: string;
  summary: {
    closedCycles: number;
    openCycles: number;
    unmatchedExits: number;
    initialInventoryOpen: string;
    closedGrossPnl: string;
    closedFees: string;
    closedNetPnl: string;
    averageNetPnl: string;
    winRatePct: string;
  };
  rows: GridCycleRow[];
}

interface FillWithOrder {
  fill: PersistedFill;
  order?: PersistedOrder;
  index: number | null;
}

interface OpenLot {
  id: string;
  source: GridCycleSource;
  band: string;
  asset: string;
  positionSide: "long" | "short";
  entrySide: OrderSide;
  entryPrice: Decimal;
  initialQuantity: Decimal;
  remainingQuantity: Decimal;
  remainingFee: Decimal;
  entryAt: string;
  entryGridLevelId?: string | null;
  targetExitPrice?: string;
}

export function buildGridCycleReport(bot: Bot, orders: PersistedOrder[], fills: PersistedFill[]): GridCycleReport {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const chronologicalFills = fills
    .map((fill): FillWithOrder => {
      const order = fill.orderId ? orderById.get(fill.orderId) : undefined;
      return { fill, order, index: parseGridIndex(order?.grid_level_id) };
    })
    .sort((a, b) => Date.parse(a.fill.executedAt) - Date.parse(b.fill.executedAt));

  const queues = new Map<string, OpenLot[]>();
  const initialInventory: OpenLot[] = [];
  const closedRows: GridCycleRow[] = [];
  const unmatchedRows: GridCycleRow[] = [];

  for (const item of chronologicalFills) {
    const reduceOnly = Boolean(item.order?.reduce_only);
    if (!reduceOnly) {
      const lot = buildOpenLot(bot.config, item);
      if (!lot) continue;
      if (lot.source === "initial_inventory") {
        initialInventory.push(lot);
      } else {
        const queue = queues.get(lot.band) ?? [];
        queue.push(lot);
        queues.set(lot.band, queue);
      }
      continue;
    }

    const band = pairedBand(bot.config, item.fill.side, true, item.index);
    const exitQuantity = safeDecimal(item.fill.quantity);
    if (!band || exitQuantity.lte(0)) continue;

    let remaining = exitQuantity;
    const queue = queues.get(band) ?? [];
    const sourceQueues = [queue, initialInventory];

    for (const sourceQueue of sourceQueues) {
      while (remaining.gt(0) && sourceQueue.length > 0) {
        const lot = sourceQueue[0];
        const quantity = DecimalMin(remaining, lot.remainingQuantity);
        const entryFee = consumeLotFee(lot, quantity);
        const exitFee = safeDecimal(item.fill.fee).mul(quantity).div(exitQuantity);
        const grossPnl = cycleGrossPnl(bot.config, lot.entryPrice, safeDecimal(item.fill.price), quantity);
        const fees = entryFee.plus(exitFee);
        const netPnl = grossPnl.minus(fees);

        closedRows.push({
          id: `${lot.id}:${item.fill.id}:${toDecimalString(quantity, 8)}`,
          status: "closed",
          source: lot.source,
          band: lot.band === "initial" ? band : lot.band,
          asset: item.fill.asset,
          positionSide: bot.config.positionSide,
          entrySide: lot.entrySide,
          exitSide: item.fill.side,
          entryPrice: toDecimalString(lot.entryPrice, 8),
          exitPrice: item.fill.price,
          quantity: toDecimalString(quantity, 8),
          grossPnl: toDecimalString(grossPnl, 6),
          fees: toDecimalString(fees, 6),
          netPnl: toDecimalString(netPnl, 6),
          entryAt: lot.entryAt,
          exitAt: item.fill.executedAt,
          entryGridLevelId: lot.entryGridLevelId,
          exitGridLevelId: item.order?.grid_level_id ?? null,
        });

        remaining = remaining.minus(quantity);
        if (lot.remainingQuantity.lte(0)) sourceQueue.shift();
      }
    }

    if (remaining.gt(0)) {
      const exitFee = safeDecimal(item.fill.fee).mul(remaining).div(exitQuantity);
      unmatchedRows.push({
        id: `unmatched:${item.fill.id}`,
        status: "unmatched_exit",
        source: "grid",
        band,
        asset: item.fill.asset,
        positionSide: bot.config.positionSide,
        exitSide: item.fill.side,
        exitPrice: item.fill.price,
        quantity: toDecimalString(remaining, 8),
        grossPnl: "0",
        fees: toDecimalString(exitFee, 6),
        netPnl: toDecimalString(exitFee.neg(), 6),
        exitAt: item.fill.executedAt,
        exitGridLevelId: item.order?.grid_level_id ?? null,
      });
    }
  }

  const openRows = Array.from(queues.values())
    .flat()
    .concat(initialInventory)
    .filter((lot) => lot.remainingQuantity.gt(0))
    .map((lot): GridCycleRow => ({
      id: `open:${lot.id}`,
      status: "open",
      source: lot.source,
      band: lot.band,
      asset: lot.asset,
      positionSide: lot.positionSide,
      entrySide: lot.entrySide,
      entryPrice: toDecimalString(lot.entryPrice, 8),
      targetExitPrice: lot.targetExitPrice,
      quantity: toDecimalString(lot.remainingQuantity, 8),
      grossPnl: "0",
      fees: toDecimalString(lot.remainingFee, 6),
      netPnl: toDecimalString(lot.remainingFee.neg(), 6),
      entryAt: lot.entryAt,
      entryGridLevelId: lot.entryGridLevelId,
    }));

  const closedGrossPnl = closedRows.reduce((total, row) => total.plus(row.grossPnl), decimal(0));
  const closedFees = closedRows.reduce((total, row) => total.plus(row.fees), decimal(0));
  const closedNetPnl = closedRows.reduce((total, row) => total.plus(row.netPnl), decimal(0));
  const winningCycles = closedRows.filter((row) => safeDecimal(row.netPnl).gt(0)).length;
  const initialInventoryOpen = initialInventory.reduce((total, lot) => total.plus(lot.remainingQuantity), decimal(0));
  const rows = [...closedRows, ...unmatchedRows, ...openRows].sort((a, b) => {
    const left = Date.parse(a.exitAt ?? a.entryAt ?? "");
    const right = Date.parse(b.exitAt ?? b.entryAt ?? "");
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });

  return {
    botId: bot.id,
    generatedAt: new Date().toISOString(),
    summary: {
      closedCycles: closedRows.length,
      openCycles: openRows.length,
      unmatchedExits: unmatchedRows.length,
      initialInventoryOpen: toDecimalString(initialInventoryOpen, 8),
      closedGrossPnl: toDecimalString(closedGrossPnl, 6),
      closedFees: toDecimalString(closedFees, 6),
      closedNetPnl: toDecimalString(closedNetPnl, 6),
      averageNetPnl: closedRows.length ? toDecimalString(closedNetPnl.div(closedRows.length), 6) : "0",
      winRatePct: closedRows.length ? toDecimalString(decimal(winningCycles).div(closedRows.length).mul(100), 2) : "0",
    },
    rows,
  };
}

function buildOpenLot(config: GridConfig, item: FillWithOrder): OpenLot | null {
  const isInitialInventory = item.order?.grid_level_id?.includes("-initial-") ?? false;
  const quantity = safeDecimal(item.fill.quantity);
  if (quantity.lte(0)) return null;

  if (isInitialInventory) {
    return {
      id: item.fill.id,
      source: "initial_inventory",
      band: "initial",
      asset: item.fill.asset,
      positionSide: config.positionSide,
      entrySide: item.fill.side,
      entryPrice: safeDecimal(item.fill.price),
      initialQuantity: quantity,
      remainingQuantity: quantity,
      remainingFee: safeDecimal(item.fill.fee),
      entryAt: item.fill.executedAt,
      entryGridLevelId: item.order?.grid_level_id ?? null,
    };
  }

  const band = pairedBand(config, item.fill.side, false, item.index);
  if (!band) return null;

  return {
    id: item.fill.id,
    source: "grid",
    band,
    asset: item.fill.asset,
    positionSide: config.positionSide,
    entrySide: item.fill.side,
    entryPrice: safeDecimal(item.fill.price),
    initialQuantity: quantity,
    remainingQuantity: quantity,
    remainingFee: safeDecimal(item.fill.fee),
    entryAt: item.fill.executedAt,
    entryGridLevelId: item.order?.grid_level_id ?? null,
    targetExitPrice: targetExitPrice(config, item.fill.side, item.index),
  };
}

function pairedBand(config: GridConfig, side: OrderSide, reduceOnly: boolean, index: number | null): string | null {
  if (index === null) return null;
  const lower = config.positionSide === "long"
    ? reduceOnly
      ? index - 1
      : index
    : reduceOnly
      ? index
      : index - 1;
  const upper = lower + 1;
  if (lower < 0 || upper >= config.gridCount) return null;
  if (config.positionSide === "long" && ((reduceOnly && side !== "sell") || (!reduceOnly && side !== "buy"))) return null;
  if (config.positionSide === "short" && ((reduceOnly && side !== "buy") || (!reduceOnly && side !== "sell"))) return null;
  return `${lower}-${upper}`;
}

function targetExitPrice(config: GridConfig, side: OrderSide, index: number | null): string | undefined {
  if (index === null) return undefined;
  if (config.positionSide === "long" && side === "buy") return priceFromAdjacentGridId(config, index + 1);
  if (config.positionSide === "short" && side === "sell") return priceFromAdjacentGridId(config, index - 1);
  return undefined;
}

function priceFromAdjacentGridId(config: GridConfig, index: number): string | undefined {
  if (index < 0 || index >= config.gridCount) return undefined;
  try {
    return generateGridPrices(config)[index];
  } catch {
    return undefined;
  }
}

function parseGridIndex(gridLevelId: string | null | undefined): number | null {
  const raw = gridLevelId?.split("-")[1];
  if (!raw) return null;
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function cycleGrossPnl(config: GridConfig, entryPrice: Decimal, exitPrice: Decimal, quantity: Decimal): Decimal {
  const priceDiff = config.positionSide === "long" ? exitPrice.minus(entryPrice) : entryPrice.minus(exitPrice);
  return priceDiff.mul(quantity);
}

function consumeLotFee(lot: OpenLot, quantity: Decimal): Decimal {
  if (lot.remainingQuantity.lte(0)) return decimal(0);
  const fee = lot.remainingFee.mul(quantity).div(lot.remainingQuantity);
  lot.remainingQuantity = lot.remainingQuantity.minus(quantity);
  lot.remainingFee = lot.remainingFee.minus(fee);
  return fee;
}

function safeDecimal(value: string | number | undefined): Decimal {
  try {
    return decimal(value ?? 0);
  } catch {
    return decimal(0);
  }
}

function DecimalMin(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}
