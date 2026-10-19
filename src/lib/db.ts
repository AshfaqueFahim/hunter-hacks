import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const READONLY = process.env.VERCEL === "1" || process.env.APP_DB_READONLY === "1";
const TMP_DB_PATH = "/tmp/app.db";

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;
let _resolvedFromPath: string | null = null;

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Find the bundled data/app.db on disk. Returns the path AND a diagnostic
 * trail of every location we checked (used by the route's 500 handler).
 */
function findBundledDb(): { found: string | null; tried: { path: string; exists: boolean }[] } {
  const candidates = [
    process.env.APP_DB_PATH,
    path.join(process.cwd(), "data", "app.db"),
    "/var/task/data/app.db",
    path.join(process.cwd(), ".next", "server", "data", "app.db"),
    "/var/task/.next/server/data/app.db",
    path.resolve(__dirname, "..", "..", "data", "app.db"),
    path.resolve(__dirname, "..", "..", "..", "data", "app.db"),
    path.resolve(__dirname, "..", "..", "..", "..", "data", "app.db"),
  ].filter((p): p is string => Boolean(p));

  const tried: { path: string; exists: boolean }[] = [];
  for (const p of candidates) {
    let exists = false;
    try {
      exists = fs.existsSync(p);
    } catch {
      /* ignore */
    }
    tried.push({ path: p, exists });
  }
  const found = tried.find((t) => t.exists)?.path ?? null;
  return { found, tried };
}

/**
 * Snapshot some directories so we can see what Vercel actually shipped.
 * Helps diagnose missing-file bundling in production.
 */
function listDirSafe(dir: string, depth = 1): string[] {
  const out: string[] = [];
  function walk(d: string, current: number) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        out.push(full + (e.isDirectory() ? "/" : ""));
        if (e.isDirectory() && current < depth) walk(full, current + 1);
      }
    } catch {
      /* ignore */
    }
  }
  walk(dir, 0);
  return out.slice(0, 60);
}

export function dbBundleDiagnostics() {
  const { tried, found } = findBundledDb();
  return {
    cwd: process.cwd(),
    dirname: __dirname,
    vercel: process.env.VERCEL ?? null,
    tried,
    found,
    cwdContents: listDirSafe(process.cwd()),
    cwdDataContents: listDirSafe(path.join(process.cwd(), "data"), 2),
  };
}

export function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;
  const { found } = findBundledDb();
  let dbPath: string;

  if (READONLY) {
    // On Vercel: copy the (read-only-bundled) DB to /tmp once per cold start.
    // This sidesteps two problems at once:
    //   - whatever path Turbopack ships the file under (we just need ANY
    //     path that exists), and
    //   - the read-only FS — /tmp is the one writable mount, so we can
    //     skip the WAL pragma anxiety entirely once we're there.
    if (!found) {
      throw new Error(
        `data/app.db not found in deployed function. Tried multiple locations — see /api/debug for the full list. cwd=${process.cwd()}`,
      );
    }
    if (!fs.existsSync(TMP_DB_PATH)) {
      fs.copyFileSync(found, TMP_DB_PATH);
    }
    dbPath = TMP_DB_PATH;
    _resolvedFromPath = found;
  } else {
    dbPath = found ?? path.join(process.cwd(), "data", "app.db");
    ensureDir(dbPath);
  }

  try {
    _sqlite = new Database(
      dbPath,
      READONLY ? { readonly: true } : {},
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open SQLite at ${dbPath} (bundled from ${_resolvedFromPath ?? "n/a"}): ${msg}`);
  }
  if (!READONLY) _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  return _sqlite;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getSqlite(), { schema });
  return _db;
}

export function initSchema(): void {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      bbl                 TEXT PRIMARY KEY,
      borough             TEXT NOT NULL,
      address             TEXT NOT NULL,
      zipcode             TEXT,
      owner_name          TEXT,
      unit_count_latest   INTEGER,
      unit_count_year     INTEGER,
      on_dhcr_list_latest INTEGER NOT NULL DEFAULT 0,
      source_year_max     INTEGER,
      lat                 REAL,
      lng                 REAL
    );
    CREATE INDEX IF NOT EXISTS idx_buildings_zip  ON buildings(zipcode);
    CREATE INDEX IF NOT EXISTS idx_buildings_addr ON buildings(address);

    CREATE TABLE IF NOT EXISTS lookups (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      bbl                         TEXT,
      searched_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      was_stabilized              INTEGER,
      estimated_overcharge_cents  INTEGER
    );
  `);
}

export { schema };
