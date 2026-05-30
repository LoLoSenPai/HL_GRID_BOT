import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bots = sqliteTable(
  "bots",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    pair: text("pair").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    statusIdx: index("bots_status_idx").on(table.status),
  }),
);

export const botConfigs = sqliteTable("bot_configs", {
  id: text("id").primaryKey(),
  botId: text("bot_id").notNull().references(() => bots.id, { onDelete: "cascade" }),
  lowerPrice: text("lower_price").notNull(),
  upperPrice: text("upper_price").notNull(),
  gridCount: integer("grid_count").notNull(),
  capitalAllocation: text("capital_allocation").notNull(),
  leverage: integer("leverage").notNull(),
  spacing: text("spacing").notNull(),
  orderSize: text("order_size").notNull(),
  takeProfit: text("take_profit"),
  stopLoss: text("stop_loss"),
  maxDrawdownPct: text("max_drawdown_pct").notNull(),
  autoPauseOutOfRange: integer("auto_pause_out_of_range", { mode: "boolean" }).notNull(),
  autoRecenter: integer("auto_recenter", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const botRuntimeState = sqliteTable("bot_runtime_state", {
  botId: text("bot_id").primaryKey().references(() => bots.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  lastPrice: text("last_price"),
  equity: text("equity").notNull().default("0"),
  pnl: text("pnl").notNull().default("0"),
  exposure: text("exposure").notNull().default("0"),
  drawdownPct: text("drawdown_pct").notNull().default("0"),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id").references(() => bots.id, { onDelete: "set null" }),
    gridLevelId: text("grid_level_id"),
    providerOrderId: text("provider_order_id"),
    intentId: text("intent_id").notNull(),
    asset: text("asset").notNull(),
    side: text("side").notNull(),
    positionSide: text("position_side").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    quantity: text("quantity").notNull(),
    price: text("price"),
    reduceOnly: integer("reduce_only", { mode: "boolean" }).notNull().default(false),
    cumulativeQuantity: text("cumulative_quantity").notNull().default("0"),
    averageFillPrice: text("average_fill_price"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    botStatusIdx: index("orders_bot_status_idx").on(table.botId, table.status),
    intentIdx: uniqueIndex("orders_intent_id_idx").on(table.intentId),
  }),
);

export const fills = sqliteTable(
  "fills",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id").references(() => bots.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    providerTradeId: text("provider_trade_id"),
    asset: text("asset").notNull(),
    side: text("side").notNull(),
    quantity: text("quantity").notNull(),
    price: text("price").notNull(),
    fee: text("fee").notNull().default("0"),
    realizedPnl: text("realized_pnl").notNull().default("0"),
    executedAt: text("executed_at").notNull(),
  },
  (table) => ({
    botExecutedIdx: index("fills_bot_executed_idx").on(table.botId, table.executedAt),
  }),
);

export const positions = sqliteTable("positions", {
  id: text("id").primaryKey(),
  providerPositionId: text("provider_position_id"),
  botId: text("bot_id").references(() => bots.id, { onDelete: "set null" }),
  asset: text("asset").notNull(),
  positionSide: text("position_side").notNull(),
  quantity: text("quantity").notNull(),
  entryPrice: text("entry_price").notNull(),
  markPrice: text("mark_price").notNull(),
  unrealizedPnl: text("unrealized_pnl").notNull().default("0"),
  realizedPnl: text("realized_pnl").notNull().default("0"),
  leverage: text("leverage").notNull().default("1"),
  updatedAt: text("updated_at").notNull(),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id").references(() => bots.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    payload: text("payload"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    botCreatedIdx: index("events_bot_created_idx").on(table.botId, table.createdAt),
  }),
);

export const accountSnapshots = sqliteTable("account_snapshots", {
  id: text("id").primaryKey(),
  equity: text("equity").notNull(),
  pnl: text("pnl").notNull(),
  volume: text("volume").notNull(),
  exposure: text("exposure").notNull(),
  drawdownPct: text("drawdown_pct").notNull(),
  createdAt: text("created_at").notNull(),
});

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: text("id").primaryKey(),
  asset: text("asset").notNull(),
  mid: text("mid").notNull(),
  funding: text("funding"),
  payload: text("payload"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const metricSamples = sqliteTable("metric_samples", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  value: real("value").notNull(),
  createdAt: text("created_at").notNull(),
});
