import { getSqlite } from "@/db/client";

let initialized = false;

export function ensureDatabase() {
  if (initialized) return;

  getSqlite().exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      pair TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bots_status_idx ON bots(status);

    CREATE TABLE IF NOT EXISTS bot_configs (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      position_side TEXT NOT NULL DEFAULT 'long',
      lower_price TEXT NOT NULL,
      upper_price TEXT NOT NULL,
      grid_count INTEGER NOT NULL,
      capital_allocation TEXT NOT NULL,
      leverage INTEGER NOT NULL,
      spacing TEXT NOT NULL,
      order_size TEXT NOT NULL,
      take_profit TEXT,
      stop_loss TEXT,
      max_drawdown_pct TEXT NOT NULL,
      auto_pause_out_of_range INTEGER NOT NULL,
      auto_recenter INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_runtime_state (
      bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      last_price TEXT,
      equity TEXT NOT NULL DEFAULT '0',
      pnl TEXT NOT NULL DEFAULT '0',
      exposure TEXT NOT NULL DEFAULT '0',
      drawdown_pct TEXT NOT NULL DEFAULT '0',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      grid_level_id TEXT,
      provider_order_id TEXT,
      intent_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      side TEXT NOT NULL,
      position_side TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      quantity TEXT NOT NULL,
      price TEXT,
      reduce_only INTEGER NOT NULL DEFAULT 0,
      cumulative_quantity TEXT NOT NULL DEFAULT '0',
      average_fill_price TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_bot_status_idx ON orders(bot_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS orders_intent_id_idx ON orders(intent_id);

    CREATE TABLE IF NOT EXISTS fills (
      id TEXT PRIMARY KEY,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      provider_trade_id TEXT,
      asset TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity TEXT NOT NULL,
      price TEXT NOT NULL,
      fee TEXT NOT NULL DEFAULT '0',
      realized_pnl TEXT NOT NULL DEFAULT '0',
      executed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fills_bot_executed_idx ON fills(bot_id, executed_at);

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      provider_position_id TEXT,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      asset TEXT NOT NULL,
      position_side TEXT NOT NULL,
      quantity TEXT NOT NULL,
      entry_price TEXT NOT NULL,
      mark_price TEXT NOT NULL,
      unrealized_pnl TEXT NOT NULL DEFAULT '0',
      realized_pnl TEXT NOT NULL DEFAULT '0',
      leverage TEXT NOT NULL DEFAULT '1',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_bot_created_idx ON events(bot_id, created_at);

    CREATE TABLE IF NOT EXISTS account_snapshots (
      id TEXT PRIMARY KEY,
      equity TEXT NOT NULL,
      pnl TEXT NOT NULL,
      volume TEXT NOT NULL,
      exposure TEXT NOT NULL,
      drawdown_pct TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      mid TEXT NOT NULL,
      funding TEXT,
      payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn("bot_configs", "position_side", "TEXT NOT NULL DEFAULT 'long'");

  initialized = true;
}

export function resetDatabaseInitializationForTests() {
  initialized = false;
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = getSqlite().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  getSqlite().prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
