import { ulid } from "ulid";

import { decimal, toDecimalString } from "@/domain/decimal";
import { generateGridLevels, isOutOfRange } from "@/domain/grid";
import type {
  ActivityEvent,
  Bot,
  BotStatus,
  GridConfig,
  MarketSymbol,
  OrderSide,
  RuntimeMetrics,
  TradingMode,
} from "@/domain/types";
import { validateBotConfig } from "@/domain/risk";
import { getSqlite } from "@/db/client";
import { ensureDatabase } from "@/db/init";
import { defaultBotConfig, sampleBots } from "@/features/bots/sample-data";
import { PaperGridEngine } from "@/features/paper-trading/engine";
import type { ExecutionOrder } from "@/features/execution/types";

interface BotJoinedRow {
  id: string;
  name: string;
  status: BotStatus;
  mode: TradingMode;
  pair: MarketSymbol;
  created_at: string;
  updated_at: string;
  lower_price: string;
  upper_price: string;
  grid_count: number;
  capital_allocation: string;
  leverage: number;
  spacing: "arithmetic" | "geometric";
  order_size: string;
  take_profit: string | null;
  stop_loss: string | null;
  max_drawdown_pct: string;
  auto_pause_out_of_range: 0 | 1;
  auto_recenter: 0 | 1;
}

interface EventRow {
  id: string;
  bot_id: string | null;
  type: string;
  severity: "info" | "warning" | "error" | "success";
  message: string;
  payload: string | null;
  created_at: string;
}

interface RuntimeStateRow {
  bot_id: string;
  state: BotStatus;
  last_price: string | null;
  equity: string;
  pnl: string;
  exposure: string;
  drawdown_pct: string;
  updated_at: string;
}

export interface PersistedOrder {
  id: string;
  bot_id: string | null;
  grid_level_id: string | null;
  intent_id: string;
  asset: MarketSymbol;
  side: OrderSide;
  position_side: "long" | "short";
  type: "market" | "limit";
  status: "pending" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  quantity: string;
  price: string | null;
  reduce_only: 0 | 1;
  cumulative_quantity: string;
  average_fill_price: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersistedFill {
  id: string;
  botId?: string;
  orderId?: string;
  asset: MarketSymbol;
  side: OrderSide;
  quantity: string;
  price: string;
  fee: string;
  realizedPnl: string;
  executedAt: string;
}

export interface BotRuntimeState {
  botId: string;
  state: BotStatus;
  lastPrice?: string;
  equity: string;
  pnl: string;
  exposure: string;
  drawdownPct: string;
  updatedAt: string;
}

export interface PaperReconciliationOptions {
  botId?: string;
  markPrices?: Partial<Record<MarketSymbol, string>>;
  emitEvents?: boolean;
}

export interface PaperReconciliationSummary {
  scanned: number;
  reconciled: number;
  paused: number;
  outOfRange: number;
  errors: Array<{ botId: string; message: string }>;
}

export function bootstrapBots() {
  ensureDatabase();
  const db = getSqlite();
  const count = db.prepare("SELECT COUNT(*) AS count FROM bots").get() as { count: number };
  if (count.count > 0) return;

  const insert = db.transaction(() => {
    for (const bot of sampleBots) {
      insertBotRows(bot.name, bot.config, bot.id, bot.status, bot.createdAt);
    }
    addEvent({
      type: "system.seeded",
      severity: "success",
      message: "SQLite persistence initialized with starter bots.",
    });
  });
  insert();
}

export function listBots(): Bot[] {
  bootstrapBots();
  const rows = getSqlite()
    .prepare(
      `
      SELECT b.*, c.lower_price, c.upper_price, c.grid_count, c.capital_allocation,
        c.leverage, c.spacing, c.order_size, c.take_profit, c.stop_loss,
        c.max_drawdown_pct, c.auto_pause_out_of_range, c.auto_recenter
      FROM bots b
      JOIN bot_configs c ON c.bot_id = b.id
      ORDER BY b.updated_at DESC
    `,
    )
    .all() as BotJoinedRow[];
  return rows.map(mapBot);
}

export function getBot(id: string): Bot | null {
  bootstrapBots();
  const row = getSqlite()
    .prepare(
      `
      SELECT b.*, c.lower_price, c.upper_price, c.grid_count, c.capital_allocation,
        c.leverage, c.spacing, c.order_size, c.take_profit, c.stop_loss,
        c.max_drawdown_pct, c.auto_pause_out_of_range, c.auto_recenter
      FROM bots b
      JOIN bot_configs c ON c.bot_id = b.id
      WHERE b.id = ?
    `,
    )
    .get(id) as BotJoinedRow | undefined;
  return row ? mapBot(row) : null;
}

export function getBotRuntimeState(id: string): BotRuntimeState | null {
  bootstrapBots();
  const row = getSqlite()
    .prepare("SELECT * FROM bot_runtime_state WHERE bot_id = ?")
    .get(id) as RuntimeStateRow | undefined;
  return row ? mapRuntimeState(row) : null;
}

export function createBot(name: string, config: GridConfig = defaultBotConfig): Bot {
  bootstrapBots();
  const issues = validateBotConfig(config).filter((issue) => issue.severity === "error");
  if (issues.length) throw new Error(issues[0].message);

  const id = `bot_${ulid().toLowerCase()}`;
  const now = new Date().toISOString();
  const tx = getSqlite().transaction(() => {
    insertBotRows(name, config, id, "draft", now);
    addEvent({
      botId: id,
      type: "bot.created",
      severity: "success",
      message: `${name} created.`,
      payload: { mode: config.mode, pair: config.pair },
    });
  });
  tx();
  const bot = getBot(id);
  if (!bot) throw new Error("Created bot was not found.");
  return bot;
}

export function duplicateBot(id: string): Bot {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  return createBot(`${bot.name} Copy`, bot.config);
}

export function createLiveCandidate(
  name: string,
  config: GridConfig,
  payload: Record<string, unknown> = { source: "manual_config" },
): Bot {
  const bot = createBot(name, {
    ...config,
    mode: "propr_live",
    autoPauseOutOfRange: true,
    autoRecenter: false,
  });

  addEvent({
    botId: bot.id,
    type: "bot.live_candidate_created",
    severity: "warning",
    message: `${bot.name} created as a Propr Live candidate. Start remains disabled until guarded live runtime is enabled.`,
    payload,
  });

  return bot;
}

export function createLiveCandidateFromBot(id: string): Bot {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  return createLiveCandidate(liveCandidateName(bot.name), bot.config, {
    source: "paper_bot",
    sourceBotId: bot.id,
  });
}

export function updateBotStatus(id: string, status: BotStatus) {
  bootstrapBots();
  const now = new Date().toISOString();
  getSqlite()
    .prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, now, id);
  getSqlite()
    .prepare("UPDATE bot_runtime_state SET state = ?, updated_at = ? WHERE bot_id = ?")
    .run(status, now, id);
  addEvent({
    botId: id,
    type: `bot.${status}`,
    severity: status === "error" || status === "out_of_range" ? "warning" : "info",
    message: `Bot status changed to ${status}.`,
  });
}

export function deleteBot(id: string) {
  bootstrapBots();
  const tx = getSqlite().transaction(() => {
    getSqlite().prepare("DELETE FROM fills WHERE bot_id = ?").run(id);
    getSqlite().prepare("DELETE FROM orders WHERE bot_id = ?").run(id);
    getSqlite().prepare("DELETE FROM events WHERE bot_id = ?").run(id);
    getSqlite().prepare("DELETE FROM bots WHERE id = ?").run(id);
  });
  tx();
}

export async function createAndStartPaperBot(name: string, config: GridConfig): Promise<Bot> {
  if (config.mode === "propr_live") {
    throw new Error("Propr Live cannot be started by the paper runtime.");
  }

  const bot = createBot(name, config);
  await startPaperBot(bot.id);
  const updated = getBot(bot.id);
  if (!updated) throw new Error("Started bot was not found.");
  return updated;
}

export async function startPaperBot(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  if (bot.config.mode === "propr_live") {
    throw new Error("Propr Live cannot be started from the paper runtime.");
  }

  const referencePrice = midpoint(bot.config);
  const engine = new PaperGridEngine();
  const state = await engine.start(id, bot.config, referencePrice);
  const now = new Date().toISOString();
  const status: BotStatus = state.status === "out_of_range" ? "out_of_range" : "paper";

  const tx = getSqlite().transaction(() => {
    getSqlite().prepare("DELETE FROM orders WHERE bot_id = ? AND status = 'open'").run(id);
    for (const order of state.orders) insertOrder(order);
    getSqlite()
      .prepare(
        `
        INSERT INTO bot_runtime_state (bot_id, state, last_price, equity, pnl, exposure, drawdown_pct, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bot_id) DO UPDATE SET
          state = excluded.state,
          last_price = excluded.last_price,
          equity = excluded.equity,
          pnl = excluded.pnl,
          exposure = excluded.exposure,
          drawdown_pct = excluded.drawdown_pct,
          updated_at = excluded.updated_at
      `,
      )
      .run(id, status, referencePrice, state.metrics.equity, "0", state.metrics.exposure, "0", now);
    getSqlite()
      .prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
    addEvent({
      botId: id,
      type: "bot.started",
      severity: status === "out_of_range" ? "warning" : "success",
      message: `${bot.name} started with ${state.orders.length} paper orders.`,
      payload: { referencePrice, orderCount: state.orders.length },
    });
  });
  tx();
}

export function stopBot(id: string) {
  bootstrapBots();
  const now = new Date().toISOString();
  const tx = getSqlite().transaction(() => {
    getSqlite()
      .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE bot_id = ? AND status = 'open'")
      .run(now, id);
    getSqlite().prepare("UPDATE bots SET status = 'stopped', updated_at = ? WHERE id = ?").run(now, id);
    getSqlite()
      .prepare("UPDATE bot_runtime_state SET state = 'stopped', updated_at = ? WHERE bot_id = ?")
      .run(now, id);
    addEvent({
      botId: id,
      type: "bot.stopped",
      severity: "warning",
      message: "Bot stopped and open paper orders cancelled.",
    });
  });
  tx();
}

export function simulateNextPaperFill(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  const order = getSqlite()
    .prepare(
      `
      SELECT * FROM orders
      WHERE bot_id = ? AND status = 'open'
      ORDER BY created_at ASC
      LIMIT 1
    `,
    )
    .get(id) as PersistedOrder | undefined;
  if (!order || !order.price) throw new Error("No open order available to fill.");

  const fillPrice = order.price;
  const now = new Date().toISOString();
  const notional = decimal(order.quantity).mul(fillPrice);
  const nextOrder = pairedOrder(bot.config, order);

  const tx = getSqlite().transaction(() => {
    getSqlite()
      .prepare(
        `
        UPDATE orders SET status = 'filled', cumulative_quantity = ?, average_fill_price = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(order.quantity, order.price, now, order.id);
    getSqlite()
      .prepare(
        `
        INSERT INTO fills (id, bot_id, order_id, provider_trade_id, asset, side, quantity, price, fee, realized_pnl, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        `fill_${ulid().toLowerCase()}`,
        id,
        order.id,
        null,
        order.asset,
        order.side,
        order.quantity,
        fillPrice,
        toDecimalString(notional.mul("0.00075"), 6),
        order.side === "sell" ? toDecimalString(notional.mul("0.001"), 4) : "0",
        now,
      );
    insertOrder(nextOrder);
    updateRuntimeFromAggregates(id, fillPrice);
    addEvent({
      botId: id,
      type: "order.filled",
      severity: "success",
      message: `${order.side.toUpperCase()} ${order.quantity} ${order.asset} filled at ${fillPrice}.`,
      payload: { pairedOrderId: nextOrder.id, notional: toDecimalString(notional, 2) },
    });
  });
  tx();
}

export function reconcilePaperRuntime(options: PaperReconciliationOptions = {}): PaperReconciliationSummary {
  bootstrapBots();
  const emitEvents = options.emitEvents ?? true;
  const candidates = listBots().filter(
    (bot) =>
      (!options.botId || bot.id === options.botId) &&
      bot.config.mode !== "propr_live" &&
      ["paper", "running", "out_of_range"].includes(bot.status),
  );
  const summary: PaperReconciliationSummary = {
    scanned: candidates.length,
    reconciled: 0,
    paused: 0,
    outOfRange: 0,
    errors: [],
  };

  for (const bot of candidates) {
    try {
      reconcileSinglePaperBot(bot, options.markPrices?.[bot.config.pair], emitEvents, summary);
    } catch (error) {
      summary.errors.push({
        botId: bot.id,
        message: error instanceof Error ? error.message : "Reconciliation failed",
      });
    }
  }

  return summary;
}

export function listEvents(limit = 50, botId?: string): ActivityEvent[] {
  bootstrapBots();
  const rows = botId
    ? (getSqlite()
        .prepare("SELECT * FROM events WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(botId, limit) as EventRow[])
    : (getSqlite()
        .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?")
        .all(limit) as EventRow[]);
  return rows.map(mapEvent);
}

export function listOrders(botId?: string): PersistedOrder[] {
  bootstrapBots();
  return botId
    ? (getSqlite()
        .prepare("SELECT * FROM orders WHERE bot_id = ? ORDER BY created_at DESC")
        .all(botId) as PersistedOrder[])
    : (getSqlite().prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as PersistedOrder[]);
}

export function listFills(botId?: string): PersistedFill[] {
  bootstrapBots();
  const rows = botId
    ? (getSqlite()
        .prepare("SELECT * FROM fills WHERE bot_id = ? ORDER BY executed_at DESC")
        .all(botId) as Array<{
        id: string;
        bot_id: string | null;
        order_id: string | null;
        asset: MarketSymbol;
        side: OrderSide;
        quantity: string;
        price: string;
        fee: string;
        realized_pnl: string;
        executed_at: string;
      }>)
    : (getSqlite().prepare("SELECT * FROM fills ORDER BY executed_at DESC").all() as Array<{
        id: string;
        bot_id: string | null;
        order_id: string | null;
        asset: MarketSymbol;
        side: OrderSide;
        quantity: string;
        price: string;
        fee: string;
        realized_pnl: string;
        executed_at: string;
      }>);

  return rows.map((row) => ({
    id: row.id,
    botId: row.bot_id ?? undefined,
    orderId: row.order_id ?? undefined,
    asset: row.asset,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    realizedPnl: row.realized_pnl,
    executedAt: row.executed_at,
  }));
}

export function getRuntimeMetrics(): RuntimeMetrics {
  bootstrapBots();
  const db = getSqlite();
  const botRows = db.prepare("SELECT capital_allocation FROM bot_configs").all() as Array<{ capital_allocation: string }>;
  const orderRows = db.prepare("SELECT quantity, price FROM orders WHERE status = 'open'").all() as Array<{
    quantity: string;
    price: string | null;
  }>;
  const fillRows = db.prepare("SELECT quantity, price, realized_pnl FROM fills").all() as Array<{
    quantity: string;
    price: string;
    realized_pnl: string;
  }>;

  const allocated = botRows.reduce((sum, row) => sum.plus(row.capital_allocation), decimal(0));
  const exposure = orderRows.reduce(
    (sum, row) => sum.plus(decimal(row.quantity).mul(row.price ?? "0")),
    decimal(0),
  );
  const volume = fillRows.reduce((sum, row) => sum.plus(decimal(row.quantity).mul(row.price)), decimal(0));
  const realizedPnl = fillRows.reduce((sum, row) => sum.plus(row.realized_pnl), decimal(0));
  const equity = decimal(10000).plus(realizedPnl);

  return {
    equity: toDecimalString(equity, 2),
    pnl: toDecimalString(realizedPnl, 2),
    realizedPnl: toDecimalString(realizedPnl, 2),
    unrealizedPnl: "0",
    volume: toDecimalString(volume, 2),
    exposure: toDecimalString(exposure, 2),
    drawdownPct: allocated.gt(0) ? "0" : "0",
    openOrders: orderRows.length,
    fills: fillRows.length,
  };
}

function insertBotRows(name: string, config: GridConfig, id: string, status: BotStatus, timestamp: string) {
  getSqlite()
    .prepare("INSERT INTO bots (id, name, status, mode, pair, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, name, status, config.mode, config.pair, timestamp, timestamp);
  getSqlite()
    .prepare(
      `
      INSERT INTO bot_configs (
        id, bot_id, lower_price, upper_price, grid_count, capital_allocation,
        leverage, spacing, order_size, take_profit, stop_loss, max_drawdown_pct,
        auto_pause_out_of_range, auto_recenter, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      `cfg_${ulid().toLowerCase()}`,
      id,
      config.lowerPrice,
      config.upperPrice,
      config.gridCount,
      config.capitalAllocation,
      config.leverage,
      config.spacing,
      config.orderSize,
      config.takeProfit ?? null,
      config.stopLoss ?? null,
      config.maxDrawdownPct,
      config.autoPauseOutOfRange ? 1 : 0,
      config.autoRecenter ? 1 : 0,
      timestamp,
    );
  getSqlite()
    .prepare(
      `
      INSERT INTO bot_runtime_state (bot_id, state, last_price, equity, pnl, exposure, drawdown_pct, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(id, status, null, config.capitalAllocation, "0", "0", "0", timestamp);
}

function insertOrder(order: ExecutionOrder) {
  getSqlite()
    .prepare(
      `
      INSERT OR IGNORE INTO orders (
        id, bot_id, grid_level_id, provider_order_id, intent_id, asset, side, position_side,
        type, status, quantity, price, reduce_only, cumulative_quantity, average_fill_price,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      order.id,
      order.botId ?? null,
      order.gridLevelId ?? null,
      order.providerOrderId ?? null,
      order.intentId,
      order.asset,
      order.side,
      order.positionSide,
      order.type,
      order.status,
      order.quantity,
      order.price ?? null,
      order.reduceOnly ? 1 : 0,
      order.cumulativeQuantity,
      order.averageFillPrice ?? null,
      order.createdAt,
      order.updatedAt,
    );
}

function addEvent(event: {
  botId?: string;
  type: string;
  severity: "info" | "warning" | "error" | "success";
  message: string;
  payload?: Record<string, unknown>;
}) {
  ensureDatabase();
  getSqlite()
    .prepare("INSERT INTO events (id, bot_id, type, severity, message, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      `evt_${ulid().toLowerCase()}`,
      event.botId ?? null,
      event.type,
      event.severity,
      event.message,
      event.payload ? JSON.stringify(event.payload) : null,
      new Date().toISOString(),
    );
}

function updateRuntimeFromAggregates(botId: string, lastPrice: string) {
  const metrics = getRuntimeMetrics();
  const now = new Date().toISOString();
  getSqlite()
    .prepare(
      `
      UPDATE bot_runtime_state SET last_price = ?, equity = ?, pnl = ?, exposure = ?, drawdown_pct = ?, updated_at = ?
      WHERE bot_id = ?
    `,
    )
    .run(lastPrice, metrics.equity, metrics.pnl, metrics.exposure, metrics.drawdownPct, now, botId);
}

function reconcileSinglePaperBot(
  bot: Bot,
  markPrice: string | undefined,
  emitEvents: boolean,
  summary: PaperReconciliationSummary,
) {
  const db = getSqlite();
  const openOrders = db
    .prepare("SELECT quantity, price FROM orders WHERE bot_id = ? AND status = 'open'")
    .all(bot.id) as Array<{ quantity: string; price: string | null }>;
  const fillRows = db
    .prepare("SELECT quantity, price, realized_pnl FROM fills WHERE bot_id = ?")
    .all(bot.id) as Array<{ quantity: string; price: string; realized_pnl: string }>;
  const runtime = getBotRuntimeState(bot.id);
  const resolvedMarkPrice = markPrice ?? runtime?.lastPrice ?? midpoint(bot.config);
  const exposure = openOrders.reduce(
    (sum, order) => sum.plus(decimal(order.quantity).mul(order.price ?? resolvedMarkPrice)),
    decimal(0),
  );
  const realizedPnl = fillRows.reduce((sum, row) => sum.plus(row.realized_pnl), decimal(0));
  const volume = fillRows.reduce((sum, row) => sum.plus(decimal(row.quantity).mul(row.price)), decimal(0));
  const outOfRange = bot.config.autoPauseOutOfRange && isOutOfRange(bot.config, resolvedMarkPrice);
  const nextStatus: BotStatus =
    openOrders.length === 0 ? "paused" : outOfRange ? "out_of_range" : bot.status === "running" ? "running" : "paper";
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO bot_runtime_state (bot_id, state, last_price, equity, pnl, exposure, drawdown_pct, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bot_id) DO UPDATE SET
        state = excluded.state,
        last_price = excluded.last_price,
        equity = excluded.equity,
        pnl = excluded.pnl,
        exposure = excluded.exposure,
        drawdown_pct = excluded.drawdown_pct,
        updated_at = excluded.updated_at
    `,
    )
      .run(
        bot.id,
        nextStatus,
        resolvedMarkPrice,
        toDecimalString(decimal(bot.config.capitalAllocation).plus(realizedPnl), 2),
        toDecimalString(realizedPnl, 2),
        toDecimalString(exposure, 2),
        "0",
        now,
      );
    db.prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, bot.id);

    if (emitEvents) {
      addEvent({
        botId: bot.id,
        type: openOrders.length === 0 ? "runtime.reconciled_paused" : "runtime.reconciled",
        severity: openOrders.length === 0 || outOfRange ? "warning" : "success",
        message:
          openOrders.length === 0
            ? "Paper runtime reconciled and paused because no open orders were persisted."
            : `Paper runtime reconciled from ${openOrders.length} open orders.`,
        payload: {
          markPrice: resolvedMarkPrice,
          openOrders: openOrders.length,
          exposure: toDecimalString(exposure, 2),
          volume: toDecimalString(volume, 2),
        },
      });
    }
  });
  tx();

  summary.reconciled += 1;
  if (nextStatus === "paused") summary.paused += 1;
  if (nextStatus === "out_of_range") summary.outOfRange += 1;
}

function pairedOrder(config: GridConfig, filled: PersistedOrder): ExecutionOrder {
  const referencePrice = midpoint(config);
  const levels = generateGridLevels(config, referencePrice);
  const currentIndex = Number(filled.grid_level_id?.split("-")[1] ?? "0");
  const nextIndex = filled.side === "buy" ? Math.min(currentIndex + 1, levels.length - 1) : Math.max(currentIndex - 1, 0);
  const level = levels[nextIndex];
  const side: OrderSide = filled.side === "buy" ? "sell" : "buy";
  const now = new Date().toISOString();

  return {
    id: `ord_${ulid().toLowerCase()}`,
    intentId: ulid(),
    botId: filled.bot_id ?? undefined,
    gridLevelId: level.id,
    asset: config.pair,
    side,
    positionSide: "long",
    type: "limit",
    quantity: level.quantity,
    price: level.price,
    status: "open",
    cumulativeQuantity: "0",
    reduceOnly: side === "sell",
    createdAt: now,
    updatedAt: now,
  };
}

function midpoint(config: GridConfig): string {
  return toDecimalString(decimal(config.lowerPrice).plus(config.upperPrice).div(2), 6);
}

function liveCandidateName(name: string): string {
  return name.includes("Live Candidate") ? `${name} Copy` : `${name} Live Candidate`;
}

function mapBot(row: BotJoinedRow): Bot {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    config: {
      pair: row.pair,
      lowerPrice: row.lower_price,
      upperPrice: row.upper_price,
      gridCount: row.grid_count,
      capitalAllocation: row.capital_allocation,
      leverage: row.leverage,
      spacing: row.spacing,
      orderSize: row.order_size,
      takeProfit: row.take_profit ?? undefined,
      stopLoss: row.stop_loss ?? undefined,
      maxDrawdownPct: row.max_drawdown_pct,
      autoPauseOutOfRange: Boolean(row.auto_pause_out_of_range),
      autoRecenter: Boolean(row.auto_recenter),
      mode: row.mode,
    },
  };
}

function mapEvent(row: EventRow): ActivityEvent {
  return {
    id: row.id,
    botId: row.bot_id ?? undefined,
    type: row.type,
    severity: row.severity,
    message: row.message,
    payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
  };
}

function mapRuntimeState(row: RuntimeStateRow): BotRuntimeState {
  return {
    botId: row.bot_id,
    state: row.state,
    lastPrice: row.last_price ?? undefined,
    equity: row.equity,
    pnl: row.pnl,
    exposure: row.exposure,
    drawdownPct: row.drawdown_pct,
    updatedAt: row.updated_at,
  };
}
