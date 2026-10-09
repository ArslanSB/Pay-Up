import { nowIso, type Db } from "./db.server";
import { newId } from "./ids.server";

export type Provider = "google" | "github";

export interface User {
  id: string;
  provider: Provider;
  providerId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UpsertUserInput {
  provider: Provider;
  providerId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}

interface UserRow {
  id: string;
  provider: Provider;
  provider_id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export function upsertUser(db: Db, input: UpsertUserInput): User {
  const row = db
    .prepare<[string, string, string, string | null, string, string | null, string], UserRow>(
      `INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, provider_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         avatar_url = excluded.avatar_url
       RETURNING *`,
    )
    .get(newId(), input.provider, input.providerId, input.email, input.name, input.avatarUrl, nowIso());
  if (!row) throw new Error("upsertUser returned no row");
  return rowToUser(row);
}

export function findUserById(db: Db, id: string): User | null {
  const row = db.prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?").get(id);
  return row ? rowToUser(row) : null;
}

/** Deletes the account; jars, fines and settlements go with it through the foreign keys. */
export function deleteUser(db: Db, id: string): boolean {
  return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}
