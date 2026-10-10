import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.server";

export type Db = Database.Database;

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email       TEXT,
    name        TEXT NOT NULL,
    avatar_url  TEXT,
    created_at  TEXT NOT NULL,
    UNIQUE (provider, provider_id)
  );
  CREATE TABLE jars (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_slug TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    fine_amount  INTEGER NOT NULL CHECK (fine_amount > 0),
    currency    TEXT NOT NULL,
    visibility  TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX jars_owner ON jars(owner_id);
  CREATE TABLE settlements (
    id         TEXT PRIMARY KEY,
    jar_id     TEXT NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    total      INTEGER NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX settlements_jar ON settlements(jar_id, created_at);
  CREATE TABLE fines (
    id            TEXT PRIMARY KEY,
    jar_id        TEXT NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    amount        INTEGER NOT NULL,
    note          TEXT,
    settlement_id TEXT REFERENCES settlements(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX fines_jar ON fines(jar_id, created_at);
  `,
  `
  CREATE TABLE devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('phone', 'watch')),
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );
  CREATE INDEX devices_user ON devices(user_id);
  CREATE TABLE device_links (
    id               TEXT PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code        TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL CHECK (kind IN ('phone', 'watch')),
    name             TEXT NOT NULL,
    approved_by      TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    last_polled_at   TEXT
  );
  ALTER TABLE fines ADD COLUMN client_id TEXT;
  CREATE UNIQUE INDEX fines_client ON fines(jar_id, client_id) WHERE client_id IS NOT NULL;
  `,
];

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let singleton: Db | null = null;

export function getDb(): Db {
  singleton ??= openDatabase(env().databasePath);
  return singleton;
}
