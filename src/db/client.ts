import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import * as schema from "@/db/schema";
import { getEnv } from "@/lib/env";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database.Database | null = null;
let db: Db | null = null;

function resolveSqlitePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Only file: SQLite DATABASE_URL values are supported in V1.");
  }
  const filePath = databaseUrl.slice("file:".length);

  return filePath;
}

export function getDb(): Db {
  if (db) return db;
  sqlite = getSqlite();
  db = drizzle(sqlite, { schema });
  return db;
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;

  const filePath = resolveSqlitePath(getEnv().DATABASE_URL);
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });

  sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function closeDb() {
  sqlite?.close();
  sqlite = null;
  db = null;
}
