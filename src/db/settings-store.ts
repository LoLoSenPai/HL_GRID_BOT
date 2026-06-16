import { getSqlite } from "@/db/client";
import { ensureDatabase } from "@/db/init";

export interface PersistedSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export function setSettingValue(key: string, value: string) {
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

export function getSettingValue(key: string): PersistedSetting | null {
  ensureDatabase();
  const row = getSqlite()
    .prepare("SELECT key, value, updated_at FROM settings WHERE key = ?")
    .get(key) as { key: string; value: string; updated_at: string } | undefined;
  return row ? { key: row.key, value: row.value, updatedAt: row.updated_at } : null;
}
