import { ulid } from "ulid";

import { decimal, isPositiveDecimal, toDecimalString } from "@/domain/decimal";
import { evaluateBotExitTrigger, type BotExitTrigger } from "@/domain/exit-rules";
import { generateGridLevels, isOutOfRange, reduceOnlyForGridSide } from "@/domain/grid";
import { formatMarketSymbol } from "@/domain/markets";
import type {
  ActivityEvent,
  Bot,
  BotStatus,
  GridConfig,
  MarketSymbol,
  OrderSide,
  RuntimeMetrics,
  TradingMode,
  PositionSide,
} from "@/domain/types";
import { validateBotConfig } from "@/domain/risk";
import { getSqlite } from "@/db/client";
import { ensureDatabase } from "@/db/init";
import { defaultBotConfig } from "@/features/bots/sample-data";
import { buildChallengeRiskPreflight, type ChallengeRiskPreflight } from "@/features/bots/challenge-risk";
import { PaperGridEngine } from "@/features/paper-trading/engine";
import { ProprExecutionAdapter } from "@/features/execution/propr-adapter";
import type { ExecutionOrder, ExecutionPosition } from "@/features/execution/types";
import { getMarketSnapshots } from "@/features/market-data/service";
import { getProprChallengeSummary, type ProprChallengeSummary } from "@/features/propr/challenge-summary";
import { checkProprLiveReadiness } from "@/features/propr/readiness";

interface BotJoinedRow {
  id: string;
  name: string;
  status: BotStatus;
  mode: TradingMode;
  pair: MarketSymbol;
  created_at: string;
  updated_at: string;
  position_side: PositionSide;
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
  challenge_daily_loss_stop_pct: string | null;
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

const LEGACY_SAMPLE_BOT_IDS = ["bot_btc_range_v1", "bot_eth_compact", "bot_sol_lab"];

export interface PersistedOrder {
  id: string;
  bot_id: string | null;
  grid_level_id: string | null;
  provider_order_id: string | null;
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

export interface PersistedSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ProprEmergencyStopSummary {
  ok: boolean;
  reason: string;
  stoppedBotIds: string[];
  cancelledOrders: number;
  positionsFound: number;
  closeOrders: number;
  errors: string[];
  checkedAt: string;
}

export interface CloseBotSummary {
  ok: boolean;
  botId: string;
  reason: string;
  cancelledOrders: number;
  inventoryQuantity: string;
  positionQuantity: string;
  closeQuantity: string;
  closeOrderId?: string;
  closeOrderStatus?: ExecutionOrder["status"];
  syncedFills: number;
  errors: string[];
  checkedAt: string;
}

export function bootstrapBots() {
  ensureDatabase();
  removeLegacySampleBots();
}

function removeLegacySampleBots() {
  const db = getSqlite();
  const existing = db
    .prepare(`SELECT id FROM bots WHERE id IN (${LEGACY_SAMPLE_BOT_IDS.map(() => "?").join(", ")})`)
    .all(...LEGACY_SAMPLE_BOT_IDS) as Array<{ id: string }>;

  const tx = db.transaction(() => {
    for (const { id } of existing) {
      db.prepare("DELETE FROM fills WHERE bot_id = ?").run(id);
      db.prepare("DELETE FROM orders WHERE bot_id = ?").run(id);
      db.prepare("DELETE FROM events WHERE bot_id = ?").run(id);
      db.prepare("DELETE FROM bot_runtime_state WHERE bot_id = ?").run(id);
      db.prepare("DELETE FROM bot_configs WHERE bot_id = ?").run(id);
      db.prepare("DELETE FROM bots WHERE id = ?").run(id);
    }
    return db.prepare("DELETE FROM events WHERE type = 'system.seeded'").run().changes;
  });
  const removedSeedEvents = tx();
  if (!existing.length && removedSeedEvents === 0) return;

  addEvent({
    type: "system.legacy_samples_removed",
    severity: "info",
    message: "Legacy starter bots were removed from local persistence.",
    payload: { removedBotIds: existing.map((item) => item.id) },
  });
}

export function listBots(): Bot[] {
  bootstrapBots();
  const rows = getSqlite()
    .prepare(
      `
      SELECT b.*, c.lower_price, c.upper_price, c.grid_count, c.capital_allocation,
        c.position_side, c.leverage, c.spacing, c.order_size, c.take_profit, c.stop_loss,
        c.max_drawdown_pct, c.challenge_daily_loss_stop_pct, c.auto_pause_out_of_range, c.auto_recenter
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
        c.position_side, c.leverage, c.spacing, c.order_size, c.take_profit, c.stop_loss,
        c.max_drawdown_pct, c.challenge_daily_loss_stop_pct, c.auto_pause_out_of_range, c.auto_recenter
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
    message: `${bot.name} created as a Propr challenge candidate.`,
    payload,
  });

  return bot;
}

export function createLiveCandidateFromBot(id: string): Bot {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  return createLiveCandidate(liveCandidateName(bot.name), bot.config, {
    source: "local_sim_bot",
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

export function updateBotExitPrices(
  id: string,
  exits: { takeProfit?: string | null; stopLoss?: string | null },
): Bot {
  bootstrapBots();
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  const takeProfit = normalizeOptionalPositiveDecimal(exits.takeProfit, "Take profit");
  const stopLoss = normalizeOptionalPositiveDecimal(exits.stopLoss, "Stop loss");
  const now = new Date().toISOString();
  const tx = getSqlite().transaction(() => {
    getSqlite()
      .prepare("UPDATE bot_configs SET take_profit = ?, stop_loss = ? WHERE bot_id = ?")
      .run(takeProfit, stopLoss, id);
    getSqlite().prepare("UPDATE bots SET updated_at = ? WHERE id = ?").run(now, id);
    addEvent({
      botId: id,
      type: "bot.exit_prices_updated",
      severity: "info",
      message: `Bot exit levels updated: TP ${takeProfit ?? "disabled"}, SL ${stopLoss ?? "disabled"}.`,
      payload: {
        takeProfit,
        stopLoss,
      },
    });
  });
  tx();

  const updated = getBot(id);
  if (!updated) throw new Error("Updated bot was not found.");
  return updated;
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
    throw new Error("Challenge mode cannot be started by the local simulation runtime.");
  }

  const bot = createBot(name, config);
  await startPaperBot(bot.id);
  const updated = getBot(bot.id);
  if (!updated) throw new Error("Started bot was not found.");
  return updated;
}

export async function createAndStartProprBot(name: string, config: GridConfig): Promise<Bot> {
  await assertChallengeRiskBudget("", config);
  const bot = createBot(name, {
    ...config,
    mode: "propr_live",
    autoPauseOutOfRange: true,
    autoRecenter: false,
  });
  await startProprBot(bot.id);
  const updated = getBot(bot.id);
  if (!updated) throw new Error("Started Propr bot was not found.");
  return updated;
}

export async function startBot(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  return bot.config.mode === "propr_live" ? startProprBot(id) : startPaperBot(id);
}

export async function startPaperBot(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  if (bot.config.mode === "propr_live") {
    throw new Error("Challenge mode cannot be started from the local simulation runtime.");
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
      message: `${bot.name} started with ${state.orders.length} local simulation orders.`,
      payload: { referencePrice, orderCount: state.orders.length },
    });
  });
  tx();
}

export async function startProprBot(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  if (bot.config.mode !== "propr_live") {
    throw new Error("Only Propr Challenge bots can be started by the Propr runtime.");
  }

  const readiness = await checkProprLiveReadiness();
  if (!readiness.liveEnabled) {
    throw new Error(`Propr challenge execution is blocked: ${readiness.blockers[0] ?? "readiness check failed"}`);
  }

  const [market] = await getMarketSnapshots([bot.config.pair]);
  const referencePrice = market?.mid;
  if (!referencePrice || decimal(referencePrice).lte(0)) {
    throw new Error(`No valid market price for ${formatMarketSymbol(bot.config.pair)}.`);
  }

  const riskIssues = validateBotConfig(bot.config).filter((issue) => issue.severity === "error");
  if (riskIssues.length) throw new Error(riskIssues[0].message);
  if (bot.config.autoPauseOutOfRange && isOutOfRange(bot.config, referencePrice)) {
    throw new Error(`Current ${formatMarketSymbol(bot.config.pair)} price is outside the configured grid range.`);
  }
  await assertChallengeRiskBudget(bot.id, bot.config);

  const adapter = new ProprExecutionAdapter();
  const health = await adapter.health();
  if (!health.ok) throw new Error(health.reason ?? "Propr adapter is not healthy.");
  await adapter.setLeverage(bot.config.pair, bot.config.leverage);

  const levels = generateGridLevels(bot.config, referencePrice);
  const entryLevels = levels.filter((level) => !reduceOnlyForGridSide(bot.config.positionSide, level.side));
  const reduceOnlyLevels = levels.filter((level) => reduceOnlyForGridSide(bot.config.positionSide, level.side));
  if (!entryLevels.length) {
    throw new Error("No entry grid levels are available at the current mark price.");
  }
  if (!reduceOnlyLevels.length) {
    throw new Error("No reduce-only grid levels are available at the current mark price.");
  }

  const placedOrders: ExecutionOrder[] = [];
  let initialInventoryOrder: ExecutionOrder | null = null;
  try {
    for (const level of entryLevels) {
      const order = await adapter.placeOrder({
        clientOrderId: ulid(),
        botId: bot.id,
        gridLevelId: level.id,
        asset: bot.config.pair,
        side: level.side,
        positionSide: bot.config.positionSide,
        type: "limit",
        quantity: level.quantity,
        price: level.price,
        timeInForce: "GTC",
        reduceOnly: false,
      });
      placedOrders.push(order);
    }

    const initialInventoryQuantity = sumLevelQuantities(reduceOnlyLevels);
    initialInventoryOrder = await adapter.placeOrder({
      clientOrderId: ulid(),
      botId: bot.id,
      gridLevelId: `${bot.config.pair}-initial-${referencePrice}`,
      asset: bot.config.pair,
      side: bot.config.positionSide === "long" ? "buy" : "sell",
      positionSide: bot.config.positionSide,
      type: "market",
      quantity: initialInventoryQuantity,
      timeInForce: "IOC",
      reduceOnly: false,
    });
    placedOrders.push(initialInventoryOrder);

    for (const level of reduceOnlyLevels) {
      const order = await adapter.placeOrder({
        clientOrderId: ulid(),
        botId: bot.id,
        gridLevelId: level.id,
        asset: bot.config.pair,
        side: level.side,
        positionSide: bot.config.positionSide,
        type: "limit",
        quantity: level.quantity,
        price: level.price,
        timeInForce: "GTC",
        reduceOnly: true,
      });
      placedOrders.push(order);
    }
  } catch (error) {
    for (const order of placedOrders) {
      await adapter.cancelOrder(order.id).catch(() => null);
    }
    if (initialInventoryOrder) {
      await closeInitialInventory(adapter, bot, initialInventoryOrder.quantity).catch(() => null);
    }
    updateBotStatus(bot.id, "error");
    addEvent({
      botId: bot.id,
      type: "bot.propr_start_failed",
      severity: "error",
      message: `Propr bot deployment failed: ${error instanceof Error ? error.message : "unknown error"}`,
      payload: { cancelledPlacedOrders: placedOrders.length, initialInventoryClosed: Boolean(initialInventoryOrder) },
    });
    throw error;
  }

  const now = new Date().toISOString();
  const tx = getSqlite().transaction(() => {
    getSqlite().prepare("DELETE FROM orders WHERE bot_id = ? AND status = 'open'").run(bot.id);
    for (const order of placedOrders) insertOrder(order);
    getSqlite().prepare("UPDATE bots SET status = 'live', updated_at = ? WHERE id = ?").run(now, bot.id);
    getSqlite()
      .prepare(
        `
        UPDATE bot_runtime_state
        SET state = 'live', last_price = ?, equity = ?, pnl = ?, exposure = ?, drawdown_pct = ?, updated_at = ?
        WHERE bot_id = ?
      `,
      )
      .run(referencePrice, bot.config.capitalAllocation, "0", gridPlanNotional(levels), "0", now, bot.id);
    addEvent({
      botId: bot.id,
      type: "bot.propr_started",
      severity: "success",
      message: `${bot.name} deployed with initial inventory and ${placedOrders.length - 1} grid ladder orders.`,
      payload: {
        referencePrice,
        orderCount: placedOrders.length,
        entryOrders: entryLevels.length,
        reduceOnlyOrders: reduceOnlyLevels.length,
        initialInventoryQuantity: initialInventoryOrder.quantity,
      },
    });
  });
  tx();

  const syncedFills = await syncTradesForPlacedOrders(bot, adapter, placedOrders);
  if (syncedFills > 0) {
    updateRuntimeFromAggregates(bot.id, referencePrice);
    addEvent({
      botId: bot.id,
      type: "bot.propr_initial_fills_synced",
      severity: "success",
      message: `Initial Propr deployment fills synced: ${syncedFills} fills.`,
      payload: { syncedFills },
    });
  }
}

export async function stopBot(id: string) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  if (bot.config.mode === "propr_live") {
    const adapter = new ProprExecutionAdapter();
    const openOrders = listOrders(id).filter((order) => order.status === "open");
    for (const order of openOrders) {
      await adapter.cancelOrder(order.provider_order_id ?? order.id).catch(() => null);
    }
  }

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
      message: bot.config.mode === "propr_live" ? "Bot stopped and open Propr orders cancelled." : "Bot stopped and open local orders cancelled.",
    });
  });
  tx();
}

export async function closeBot(id: string, reason = "Manual close bot"): Promise<CloseBotSummary> {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");

  if (bot.config.mode !== "propr_live") {
    await stopBot(id);
    return {
      ok: true,
      botId: id,
      reason,
      cancelledOrders: 0,
      inventoryQuantity: "0",
      positionQuantity: "0",
      closeQuantity: "0",
      syncedFills: 0,
      errors: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const adapter = new ProprExecutionAdapter();
  const health = await adapter.health();
  if (!health.ok) {
    const message = health.reason ?? "Propr adapter is not healthy.";
    addEvent({
      botId: id,
      type: "bot.close_failed",
      severity: "error",
      message: `Bot close could not start: ${message}`,
      payload: { reason },
    });
    throw new Error(message);
  }

  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  const cancelledOrderIds: string[] = [];
  const openOrders = listOrders(id).filter((order) => order.status === "open");

  for (const order of openOrders) {
    try {
      await adapter.cancelOrder(order.provider_order_id ?? order.id);
      cancelledOrderIds.push(order.id);
    } catch (error) {
      errors.push(`cancel ${order.provider_order_id ?? order.id} failed: ${errorMessage(error)}`);
    }
  }

  let positions: ExecutionPosition[] = [];
  try {
    positions = await adapter.getPositions(bot.config.pair);
  } catch (error) {
    errors.push(`position sync failed: ${errorMessage(error)}`);
  }

  const matchingPosition = positions.find(
    (position) => position.asset === bot.config.pair && position.positionSide === bot.config.positionSide,
  );
  const positionQuantity = matchingPosition ? decimal(matchingPosition.quantity) : decimal(0);
  const localInventoryQuantity = estimateBotInventoryQuantity(bot);
  const sameSideActiveBots = listBots().filter(
    (candidate) =>
      candidate.id !== bot.id &&
      isActiveProprRuntimeBot(candidate) &&
      candidate.config.pair === bot.config.pair &&
      candidate.config.positionSide === bot.config.positionSide,
  );
  const closeQuantity =
    localInventoryQuantity.gt(0) || sameSideActiveBots.length > 0
      ? DecimalMin(localInventoryQuantity, positionQuantity)
      : positionQuantity;
  let closeOrder: ExecutionOrder | null = null;
  let syncedFills = 0;

  if (closeQuantity.gt(0)) {
    try {
      closeOrder = await adapter.placeOrder({
        clientOrderId: ulid(),
        botId: bot.id,
        gridLevelId: `${bot.config.pair}-manual-close-${checkedAt}`,
        asset: bot.config.pair,
        side: bot.config.positionSide === "long" ? "sell" : "buy",
        positionSide: bot.config.positionSide,
        type: "market",
        quantity: toDecimalString(closeQuantity, 8),
        timeInForce: "IOC",
        reduceOnly: true,
      });
      insertOrder(closeOrder);
      syncedFills = await syncTradesForPlacedOrders(bot, adapter, [closeOrder]);
    } catch (error) {
      errors.push(`close ${formatMarketSymbol(bot.config.pair)} ${bot.config.positionSide} failed: ${errorMessage(error)}`);
    }
  }

  const ok = errors.length === 0;
  const nextStatus: BotStatus = ok ? "stopped" : "error";
  const tx = getSqlite().transaction(() => {
    for (const orderId of cancelledOrderIds) {
      getSqlite()
        .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(checkedAt, orderId);
    }
    if (closeOrder) insertOrder(closeOrder);
    getSqlite().prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, checkedAt, id);
    getSqlite()
      .prepare("UPDATE bot_runtime_state SET state = ?, exposure = ?, updated_at = ? WHERE bot_id = ?")
      .run(nextStatus, ok ? "0" : getBotRuntimeState(id)?.exposure ?? "0", checkedAt, id);
    addEvent({
      botId: id,
      type: ok ? "bot.closed" : "bot.close_failed",
      severity: ok ? "warning" : "error",
      message: ok
        ? "Bot closed: local orders cancelled and bot inventory close attempted."
        : "Bot close attempted with errors.",
      payload: {
        reason,
        cancelledOrders: cancelledOrderIds.length,
        inventoryQuantity: toDecimalString(localInventoryQuantity, 8),
        positionQuantity: toDecimalString(positionQuantity, 8),
        closeQuantity: toDecimalString(closeQuantity, 8),
        closeOrderId: closeOrder?.providerOrderId ?? closeOrder?.id,
        closeOrderStatus: closeOrder?.status,
        sameSideActiveBots: sameSideActiveBots.length,
        syncedFills,
        errors,
      },
    });
  });
  tx();

  if (!ok) {
    throw new Error(errors[0] ?? "Bot close completed with errors.");
  }

  return {
    ok,
    botId: id,
    reason,
    cancelledOrders: cancelledOrderIds.length,
    inventoryQuantity: toDecimalString(localInventoryQuantity, 8),
    positionQuantity: toDecimalString(positionQuantity, 8),
    closeQuantity: toDecimalString(closeQuantity, 8),
    closeOrderId: closeOrder?.providerOrderId ?? closeOrder?.id,
    closeOrderStatus: closeOrder?.status,
    syncedFills,
    errors,
    checkedAt,
  };
}

export async function triggerProprEmergencyStop(reason = "Manual kill switch"): Promise<ProprEmergencyStopSummary> {
  bootstrapBots();
  const adapter = new ProprExecutionAdapter();
  const health = await adapter.health();
  if (!health.ok) {
    const message = health.reason ?? "Propr adapter is not healthy.";
    addEvent({
      type: "bot.propr_emergency_stop_failed",
      severity: "error",
      message: `Propr emergency stop could not start: ${message}`,
      payload: { reason },
    });
    throw new Error(message);
  }

  const challenge = await getProprChallengeSummary(getRuntimeMetrics()).catch(() => undefined);
  const summary = await executeProprAccountEmergencyStop(adapter, {
    reason,
    challenge,
    eventType: "bot.propr_emergency_stop",
  });

  if (!summary.ok) {
    throw new Error(summary.errors[0] ?? "Propr emergency stop completed with errors.");
  }

  return summary;
}

export async function reconcileProprBot(id: string): Promise<{
  syncedOrders: number;
  insertedFills: number;
  placedGridOrders: number;
  staleOpenOrders?: number;
  safetyStopTriggered?: boolean;
  exitTrigger?: BotExitTrigger;
}> {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot not found.");
  if (bot.config.mode !== "propr_live") {
    throw new Error("Only Propr challenge bots can use Propr reconciliation.");
  }

  const adapter = new ProprExecutionAdapter();
  const safetyStopTriggered = await enforceProprChallengeSafetyStop(bot, adapter);
  if (safetyStopTriggered) {
    return { syncedOrders: 0, insertedFills: 0, placedGridOrders: 0, staleOpenOrders: 0, safetyStopTriggered: true };
  }

  const [openProviderOrders, trades, positions] = await Promise.all([
    adapter.getOpenOrders(bot.config.pair),
    adapter.getTrades(bot.config.pair),
    adapter.getPositions(bot.config.pair),
  ]);
  const matchingPosition = positions.find(
    (position) => position.asset === bot.config.pair && position.positionSide === bot.config.positionSide,
  );
  const markPrice = matchingPosition?.markPrice ?? positions.find((position) => position.asset === bot.config.pair)?.markPrice;
  const exitEvaluation = evaluateBotExitTrigger(bot.config, markPrice);
  const openProviderIds = new Set(openProviderOrders.map((order) => order.providerOrderId ?? order.id));
  const persistedOrders = listOrders(bot.id);
  const now = new Date().toISOString();
  let syncedOrders = 0;
  let insertedFills = 0;
  let placedGridOrders = 0;
  const staleOpenOrders = markStaleLocalOpenOrdersCancelled(bot.id, persistedOrders, openProviderIds, trades, now);

  for (const order of persistedOrders.filter((item) => !["cancelled", "rejected"].includes(item.status))) {
    const providerOrderId = order.provider_order_id ?? order.id;
    const providerTrades = trades.filter((trade) => trade.orderId === providerOrderId);
    if (openProviderIds.has(providerOrderId) || providerTrades.length === 0) continue;
    const knownTradeRows = getSqlite()
      .prepare("SELECT provider_trade_id FROM fills WHERE order_id = ?")
      .all(order.id) as Array<{ provider_trade_id: string | null }>;
    const knownTradeIds = new Set(knownTradeRows.map((row) => row.provider_trade_id).filter(Boolean));
    const newProviderTrades = providerTrades.filter((trade) => !knownTradeIds.has(trade.providerTradeId ?? trade.id));
    if (order.status === "filled" && newProviderTrades.length === 0) continue;

    const cumulativeQuantity = providerTrades.reduce((total, trade) => total.plus(trade.quantity), decimal(0));
    const notional = providerTrades.reduce((total, trade) => total.plus(decimal(trade.quantity).mul(trade.price)), decimal(0));
    const averageFillPrice = cumulativeQuantity.gt(0) ? notional.div(cumulativeQuantity) : decimal(order.price ?? "0");

    getSqlite()
      .prepare(
        `
        UPDATE orders SET status = 'filled', cumulative_quantity = ?, average_fill_price = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(toDecimalString(cumulativeQuantity, 8), toDecimalString(averageFillPrice, 8), now, order.id);
    syncedOrders += 1;

    for (const trade of providerTrades) {
      const result = getSqlite()
        .prepare(
          `
          INSERT OR IGNORE INTO fills (
            id, bot_id, order_id, provider_trade_id, asset, side, quantity, price, fee, realized_pnl, executed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          trade.id,
          bot.id,
          order.id,
          trade.providerTradeId ?? trade.id,
          trade.asset,
          trade.side,
          trade.quantity,
          trade.price,
          trade.fee,
          trade.realizedPnl,
          trade.executedAt,
        );
      insertedFills += result.changes;
    }

    const placedGridOrder = !exitEvaluation?.trigger && hasGridLevelIndex(order)
      ? await placePairedGridOrderIfMissing(bot, adapter, order, listOrders(bot.id), openProviderIds)
      : null;
    if (placedGridOrder) placedGridOrders += 1;
  }

  if (exitEvaluation?.trigger) {
    const exitLabel = exitEvaluation.trigger === "stop_loss" ? "Stop loss" : "Take profit";
    addEvent({
      botId: bot.id,
      type: exitEvaluation.trigger === "stop_loss" ? "bot.propr_stop_loss_triggered" : "bot.propr_take_profit_triggered",
      severity: "warning",
      message: `${exitLabel} triggered for ${formatMarketSymbol(bot.config.pair)} ${bot.config.positionSide}: mark ${exitEvaluation.markPrice}, level ${exitEvaluation.triggerPrice}.`,
      payload: {
        trigger: exitEvaluation.trigger,
        markPrice: exitEvaluation.markPrice,
        triggerPrice: exitEvaluation.triggerPrice,
        positionSide: bot.config.positionSide,
      },
    });
    await closeBot(
      bot.id,
      `${exitLabel} triggered at mark ${exitEvaluation.markPrice} against level ${exitEvaluation.triggerPrice}.`,
    );
    return { syncedOrders, insertedFills, placedGridOrders, staleOpenOrders, exitTrigger: exitEvaluation.trigger };
  }

  const repairedGridOrders = await repairMissingGridOrders(bot, adapter, openProviderIds);
  placedGridOrders += repairedGridOrders;

  updateRuntimeFromAggregates(bot.id, markPrice ?? midpoint(bot.config));
  addEvent({
    botId: bot.id,
    type: "bot.propr_reconciled",
    severity: "success",
    message: `Propr sync complete: ${syncedOrders} filled orders, ${insertedFills} new fills, ${placedGridOrders} grid orders, ${staleOpenOrders} stale locals.`,
    payload: { syncedOrders, insertedFills, placedGridOrders, staleOpenOrders },
  });

  return { syncedOrders, insertedFills, placedGridOrders, staleOpenOrders };
}

function markStaleLocalOpenOrdersCancelled(
  botId: string,
  orders: PersistedOrder[],
  openProviderIds: Set<string>,
  trades: Awaited<ReturnType<ProprExecutionAdapter["getTrades"]>>,
  timestamp: string,
): number {
  let staleOpenOrders = 0;
  for (const order of orders.filter((item) => ["pending", "open", "partially_filled"].includes(item.status))) {
    const providerOrderId = order.provider_order_id ?? order.id;
    if (openProviderIds.has(providerOrderId)) continue;
    if (trades.some((trade) => trade.orderId === providerOrderId)) continue;

    getSqlite()
      .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE bot_id = ? AND id = ?")
      .run(timestamp, botId, order.id);
    staleOpenOrders += 1;
  }

  if (staleOpenOrders > 0) {
    addEvent({
      botId,
      type: "bot.propr_stale_orders_cleared",
      severity: "warning",
      message: `${staleOpenOrders} local open orders were not open on Propr and were cleared before grid repair.`,
      payload: { staleOpenOrders },
    });
  }

  return staleOpenOrders;
}

async function repairMissingGridOrders(
  bot: Bot,
  adapter: ProprExecutionAdapter,
  openProviderIds: Set<string>,
): Promise<number> {
  let placedGridOrders = 0;
  let knownOrders = listOrders(bot.id);
  const filledGridOrders = knownOrders.filter((order) => order.status === "filled" && hasGridLevelIndex(order));

  for (const filledOrder of filledGridOrders) {
    const placedGridOrder = await placePairedGridOrderIfMissing(bot, adapter, filledOrder, knownOrders, openProviderIds);
    if (!placedGridOrder) continue;
    placedGridOrders += 1;
    knownOrders = listOrders(bot.id);
  }

  return placedGridOrders;
}

async function placePairedGridOrderIfMissing(
  bot: Bot,
  adapter: ProprExecutionAdapter,
  filledOrder: PersistedOrder,
  knownOrders: PersistedOrder[],
  openProviderIds: Set<string>,
): Promise<ExecutionOrder | null> {
  const nextIntent = pairedOrder(bot.config, filledOrder);
  const existingGridOrder = knownOrders.some(
    (order) =>
      order.id !== filledOrder.id &&
      order.asset === nextIntent.asset &&
      order.side === nextIntent.side &&
      order.reduce_only === (nextIntent.reduceOnly ? 1 : 0) &&
      order.grid_level_id === nextIntent.gridLevelId &&
      blocksPairedGridReplacement(order, filledOrder, openProviderIds),
  );

  if (existingGridOrder) return null;

  const placedGridOrder = await adapter.placeOrder({
    clientOrderId: ulid(),
    botId: bot.id,
    gridLevelId: nextIntent.gridLevelId,
    asset: nextIntent.asset,
    side: nextIntent.side,
    positionSide: nextIntent.positionSide,
    type: nextIntent.type,
    quantity: nextIntent.quantity,
    price: nextIntent.price,
    timeInForce: "GTC",
    reduceOnly: nextIntent.reduceOnly,
  });
  insertOrder(placedGridOrder);
  openProviderIds.add(placedGridOrder.providerOrderId ?? placedGridOrder.id);
  return placedGridOrder;
}

function blocksPairedGridReplacement(
  candidate: PersistedOrder,
  filledOrder: PersistedOrder,
  openProviderIds: Set<string>,
): boolean {
  if (["open", "pending", "partially_filled"].includes(candidate.status)) {
    const providerOrderId = candidate.provider_order_id ?? candidate.id;
    return openProviderIds.has(providerOrderId);
  }
  if (candidate.status !== "filled") return false;

  const candidateCreatedAt = Date.parse(candidate.created_at);
  const sourceFilledAt = Date.parse(filledOrder.updated_at);
  if (!Number.isFinite(candidateCreatedAt) || !Number.isFinite(sourceFilledAt)) return true;

  return candidateCreatedAt >= sourceFilledAt;
}

async function enforceProprChallengeSafetyStop(bot: Bot, adapter: ProprExecutionAdapter): Promise<boolean> {
  const challenge = await getProprChallengeSummary(getRuntimeMetrics());
  if (challenge.source !== "propr_live") return false;

  const equity = decimal(challenge.equity);
  const dailyStopPct = decimal(bot.config.challengeDailyLossStopPct ?? "2.75");
  const dailyStopAmount = decimal(challenge.startingBalance).mul(dailyStopPct).div(100);
  const dailyFloor = decimal(challenge.dayStartEquity).minus(dailyStopAmount);
  const drawdownFloor = decimal(challenge.drawdownLimit);
  const breachedSafetyFloor = equity.lte(dailyFloor) || equity.lte(drawdownFloor);
  if (!breachedSafetyFloor) return false;

  const reason = equity.lte(dailyFloor)
    ? `Challenge equity ${toDecimalString(equity, 2)} reached the ${toDecimalString(dailyStopPct, 2)}% daily stop floor ${toDecimalString(dailyFloor, 2)}.`
    : `Challenge equity ${toDecimalString(equity, 2)} reached drawdown floor ${toDecimalString(drawdownFloor, 2)}.`;
  await executeProprAccountEmergencyStop(adapter, {
    reason,
    challenge,
    referenceBotId: bot.id,
    eventType: "bot.propr_safety_stop",
    extraPayload: {
      equity: challenge.equity,
      dailyFloor: toDecimalString(dailyFloor, 2),
      drawdownFloor: toDecimalString(drawdownFloor, 2),
    },
  });

  return true;
}

async function executeProprAccountEmergencyStop(
  adapter: ProprExecutionAdapter,
  options: {
    reason: string;
    challenge?: ProprChallengeSummary;
    referenceBotId?: string;
    eventType: "bot.propr_emergency_stop" | "bot.propr_safety_stop";
    extraPayload?: Record<string, unknown>;
  },
): Promise<ProprEmergencyStopSummary> {
  const now = new Date().toISOString();
  const activeLiveBots = listBots().filter(isActiveProprRuntimeBot);
  const stoppedBotIds = activeLiveBots.length
    ? activeLiveBots.map((item) => item.id)
    : options.referenceBotId
      ? [options.referenceBotId]
      : [];
  const referenceBotId = options.referenceBotId ?? stoppedBotIds[0];
  const errors: string[] = [];
  let cancelledOrders: ExecutionOrder[] = [];
  let cancelAllSucceeded = false;
  let positions: ExecutionPosition[] = [];
  let closeOrders = 0;

  try {
    cancelledOrders = await adapter.cancelAll();
    cancelAllSucceeded = true;
  } catch (error) {
    errors.push(`cancelAll failed: ${errorMessage(error)}`);
  }

  try {
    positions = await adapter.getPositions();
  } catch (error) {
    errors.push(`position sync failed: ${errorMessage(error)}`);
  }

  for (const position of positions) {
    try {
      await adapter.placeOrder({
        clientOrderId: ulid(),
        botId: referenceBotId,
        asset: position.asset,
        side: position.positionSide === "long" ? "sell" : "buy",
        positionSide: position.positionSide,
        type: "market",
        quantity: position.quantity,
        timeInForce: "IOC",
        reduceOnly: true,
        closePosition: true,
      });
      closeOrders += 1;
    } catch (error) {
      errors.push(`close ${formatMarketSymbol(position.asset)} ${position.positionSide} failed: ${errorMessage(error)}`);
    }
  }

  const ok = errors.length === 0;
  const nextStatus: BotStatus = ok ? "stopped" : "error";
  const tx = getSqlite().transaction(() => {
    for (const botId of stoppedBotIds) {
      if (cancelAllSucceeded) {
        getSqlite()
          .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE bot_id = ? AND status = 'open'")
          .run(now, botId);
      }
      getSqlite().prepare("UPDATE bots SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, botId);
      getSqlite()
        .prepare("UPDATE bot_runtime_state SET state = ?, equity = ?, pnl = ?, updated_at = ? WHERE bot_id = ?")
        .run(nextStatus, options.challenge?.equity ?? "0", options.challenge?.realizedPnl ?? "0", now, botId);
      addEvent({
        botId,
        type: options.eventType,
        severity: ok ? "warning" : "error",
        message: ok
          ? `Propr emergency stop completed. ${options.reason}`
          : `Propr emergency stop attempted with errors. ${options.reason}`,
        payload: {
          ...options.extraPayload,
          cancelledOrders: cancelledOrders.length,
          positionsFound: positions.length,
          closeOrders,
          errors,
        },
      });
    }

    if (!stoppedBotIds.length) {
      addEvent({
        type: options.eventType,
        severity: ok ? "warning" : "error",
        message: ok
          ? `Propr account emergency stop completed. ${options.reason}`
          : `Propr account emergency stop attempted with errors. ${options.reason}`,
        payload: {
          ...options.extraPayload,
          cancelledOrders: cancelledOrders.length,
          positionsFound: positions.length,
          closeOrders,
          errors,
        },
      });
    }
  });
  tx();

  return {
    ok,
    reason: options.reason,
    stoppedBotIds,
    cancelledOrders: cancelledOrders.length,
    positionsFound: positions.length,
    closeOrders,
    errors,
    checkedAt: now,
  };
}

function isActiveProprRuntimeBot(bot: Bot): boolean {
  return bot.config.mode === "propr_live" && ["live", "running", "out_of_range"].includes(bot.status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Propr emergency stop error";
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
      message: `${order.side.toUpperCase()} ${order.quantity} ${formatMarketSymbol(order.asset)} filled at ${fillPrice}.`,
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

export function setSetting(key: string, value: string) {
  ensureDatabase();
  const now = new Date().toISOString();
  getSqlite()
    .prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    )
    .run(key, value, now);
}

export function getSetting(key: string): PersistedSetting | null {
  ensureDatabase();
  const row = getSqlite()
    .prepare("SELECT key, value, updated_at FROM settings WHERE key = ?")
    .get(key) as { key: string; value: string; updated_at: string } | undefined;
  return row ? { key: row.key, value: row.value, updatedAt: row.updated_at } : null;
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

export async function getChallengeRiskPreflightForConfig(
  config: GridConfig,
  botId = "",
): Promise<ChallengeRiskPreflight> {
  const [challenge, markets] = await Promise.all([getProprChallengeSummary(getRuntimeMetrics()), getMarketSnapshots()]);
  const markPrices = Object.fromEntries(markets.map((market) => [market.asset, market.mid]));
  return buildChallengeRiskPreflight({
    config,
    challenge,
    committedBots: listBots(),
    currentBotId: botId,
    markPrice: markPrices[config.pair],
    markPrices,
  });
}

function insertBotRows(name: string, config: GridConfig, id: string, status: BotStatus, timestamp: string) {
  getSqlite()
    .prepare("INSERT INTO bots (id, name, status, mode, pair, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, name, status, config.mode, config.pair, timestamp, timestamp);
  getSqlite()
    .prepare(
      `
      INSERT INTO bot_configs (
        id, bot_id, position_side, lower_price, upper_price, grid_count, capital_allocation,
        leverage, spacing, order_size, take_profit, stop_loss, max_drawdown_pct, challenge_daily_loss_stop_pct,
        auto_pause_out_of_range, auto_recenter, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      `cfg_${ulid().toLowerCase()}`,
      id,
      config.positionSide,
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
      config.challengeDailyLossStopPct,
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
  const bot = getBot(botId);
  const orders = listOrders(botId);
  const fills = listFills(botId);
  const realizedPnl = fills.reduce((sum, fill) => sum.plus(fill.realizedPnl), decimal(0));
  const exposure = orders
    .filter((order) => order.status === "open")
    .reduce((sum, order) => sum.plus(decimal(order.quantity).mul(order.price ?? lastPrice)), decimal(0));
  const now = new Date().toISOString();
  getSqlite()
    .prepare(
      `
      UPDATE bot_runtime_state SET last_price = ?, equity = ?, pnl = ?, exposure = ?, drawdown_pct = ?, updated_at = ?
      WHERE bot_id = ?
    `,
    )
    .run(
      lastPrice,
      toDecimalString(decimal(bot?.config.capitalAllocation ?? 0).plus(realizedPnl), 2),
      toDecimalString(realizedPnl, 2),
      toDecimalString(exposure, 2),
      "0",
      now,
      botId,
    );
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
            ? "Local simulation runtime reconciled and paused because no open orders were persisted."
            : `Local simulation runtime reconciled from ${openOrders.length} open orders.`,
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
  const currentIndex = gridLevelIndex(filled);
  if (currentIndex === null) {
    throw new Error("Filled order is not linked to a grid level.");
  }
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
    positionSide: config.positionSide,
    type: "limit",
    quantity: filled.cumulative_quantity !== "0" ? filled.cumulative_quantity : filled.quantity,
    price: level.price,
    status: "open",
    cumulativeQuantity: "0",
    reduceOnly: reduceOnlyForGridSide(config.positionSide, side),
    createdAt: now,
    updatedAt: now,
  };
}

function hasGridLevelIndex(order: PersistedOrder): boolean {
  return gridLevelIndex(order) !== null;
}

function gridLevelIndex(order: PersistedOrder): number | null {
  const rawIndex = order.grid_level_id?.split("-")[1];
  if (!rawIndex) return null;
  const index = Number(rawIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function gridPlanNotional(levels: Array<{ quantity: string; price: string }>): string {
  return toDecimalString(
    levels.reduce((total, level) => total.plus(decimal(level.quantity).mul(level.price)), decimal(0)),
    2,
  );
}

function sumLevelQuantities(levels: Array<{ quantity: string }>): string {
  return toDecimalString(levels.reduce((total, level) => total.plus(level.quantity), decimal(0)), 8);
}

async function closeInitialInventory(adapter: ProprExecutionAdapter, bot: Bot, quantity: string) {
  await adapter.placeOrder({
    clientOrderId: ulid(),
    botId: bot.id,
    asset: bot.config.pair,
    side: bot.config.positionSide === "long" ? "sell" : "buy",
    positionSide: bot.config.positionSide,
    type: "market",
    quantity,
    timeInForce: "IOC",
    reduceOnly: true,
    closePosition: true,
  });
}

function estimateBotInventoryQuantity(bot: Bot) {
  const quantity = listOrders(bot.id).reduce((total, order) => {
    if (order.asset !== bot.config.pair || order.position_side !== bot.config.positionSide) return total;
    const executedQuantity = executedOrderQuantity(order);
    if (executedQuantity.lte(0)) return total;
    return order.reduce_only ? total.minus(executedQuantity) : total.plus(executedQuantity);
  }, decimal(0));

  return quantity.gt(0) ? quantity : decimal(0);
}

function executedOrderQuantity(order: PersistedOrder) {
  const cumulativeQuantity = decimal(order.cumulative_quantity ?? "0");
  if (cumulativeQuantity.gt(0)) return cumulativeQuantity;
  if (order.status === "filled") return decimal(order.quantity);
  return decimal(0);
}

function DecimalMin(a: ReturnType<typeof decimal>, b: ReturnType<typeof decimal>) {
  return a.lte(b) ? a : b;
}

async function syncTradesForPlacedOrders(
  bot: Bot,
  adapter: ProprExecutionAdapter,
  orders: ExecutionOrder[],
): Promise<number> {
  if (!orders.length) return 0;

  const trades = await adapter.getTrades(bot.config.pair).catch(() => []);
  const now = new Date().toISOString();
  let insertedFills = 0;

  for (const order of orders) {
    const providerOrderId = order.providerOrderId ?? order.id;
    const providerTrades = trades.filter((trade) => trade.orderId === providerOrderId);
    if (!providerTrades.length) continue;

    const cumulativeQuantity = providerTrades.reduce((total, trade) => total.plus(trade.quantity), decimal(0));
    const notional = providerTrades.reduce((total, trade) => total.plus(decimal(trade.quantity).mul(trade.price)), decimal(0));
    const averageFillPrice = cumulativeQuantity.gt(0) ? notional.div(cumulativeQuantity) : decimal(order.price ?? "0");

    getSqlite()
      .prepare(
        `
        UPDATE orders SET status = 'filled', cumulative_quantity = ?, average_fill_price = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(toDecimalString(cumulativeQuantity, 8), toDecimalString(averageFillPrice, 8), now, order.id);

    for (const trade of providerTrades) {
      const result = getSqlite()
        .prepare(
          `
          INSERT OR IGNORE INTO fills (
            id, bot_id, order_id, provider_trade_id, asset, side, quantity, price, fee, realized_pnl, executed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          trade.id,
          bot.id,
          order.id,
          trade.providerTradeId ?? trade.id,
          trade.asset,
          trade.side,
          trade.quantity,
          trade.price,
          trade.fee,
          trade.realizedPnl,
          trade.executedAt,
        );
      insertedFills += result.changes;
    }
  }

  return insertedFills;
}

async function assertChallengeRiskBudget(botId: string, config: GridConfig) {
  const preflight = await getChallengeRiskPreflightForConfig(config, botId);
  if (preflight.status === "blocked" || preflight.status === "invalid") {
    throw new Error(preflight.blockers[0] ?? "Challenge risk preflight failed.");
  }
}

function midpoint(config: GridConfig): string {
  return toDecimalString(decimal(config.lowerPrice).plus(config.upperPrice).div(2), 6);
}

function normalizeOptionalPositiveDecimal(value: string | null | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!isPositiveDecimal(normalized)) {
    throw new Error(`${label} must be a positive decimal.`);
  }
  return normalized;
}

function liveCandidateName(name: string): string {
  return name.includes("Challenge Candidate") ? `${name} Copy` : `${name} Challenge Candidate`;
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
      positionSide: row.position_side ?? "long",
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
      challengeDailyLossStopPct: row.challenge_daily_loss_stop_pct ?? "2.75",
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
