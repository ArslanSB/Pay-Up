import { describe, expect, it } from "vitest";
import { nowIso, openDatabase, type Db } from "./db.server";

describe("openDatabase", () => {
  it("creates the schema with foreign keys on", () => {
    const db = openDatabase(":memory:");
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(["device_links", "devices", "fines", "jars", "settlements", "users"]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("user_version", { simple: true })).toBe(2);
  });
  it("is idempotent", () => {
    const db = openDatabase(":memory:");
    expect(() => db.exec("SELECT 1")).not.toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(2);
  });
  it("enforces the fine_amount and visibility checks", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users (id, provider, provider_id, name, created_at) VALUES ('u1','github','1','T',?)").run(nowIso());
    const insert = (amount: number, visibility: string) =>
      db
        .prepare(
          "INSERT INTO jars (id, owner_id, public_slug, title, fine_amount, currency, visibility, created_at, updated_at) VALUES ('j1','u1','slug1','T',?,'EUR',?,?,?)",
        )
        .run(amount, visibility, nowIso(), nowIso());
    expect(() => insert(0, "public")).toThrow(/CHECK/);
    expect(() => insert(100, "friends")).toThrow(/CHECK/);
  });
});

describe("migration 2: devices, links and client fine ids", () => {
  function seed() {
    const db = openDatabase(":memory:");
    const ts = nowIso();
    db.prepare("INSERT INTO users (id, provider, provider_id, name, created_at) VALUES ('u1','github','1','T',?)").run(ts);
    for (const [id, slug] of [["j1", "slug-one"], ["j2", "slug-two"]]) {
      db.prepare(
        "INSERT INTO jars (id, owner_id, public_slug, title, fine_amount, currency, visibility, created_at, updated_at) VALUES (?,'u1',?,'T',100,'EUR','private',?,?)",
      ).run(id, slug, ts, ts);
    }
    return { db, ts };
  }
  const fine = (db: Db, id: string, jar: string, clientId: string | null) =>
    db.prepare("INSERT INTO fines (id, jar_id, amount, created_at, client_id) VALUES (?, ?, 100, ?, ?)").run(id, jar, nowIso(), clientId);

  it("keeps client ids unique per jar but allows any number of fines without one", () => {
    const { db } = seed();
    fine(db, "f1", "j1", "c-1");
    expect(() => fine(db, "f2", "j1", "c-1")).toThrow(/UNIQUE/);
    expect(() => fine(db, "f3", "j2", "c-1")).not.toThrow();
    expect(() => {
      fine(db, "f4", "j1", null);
      fine(db, "f5", "j1", null);
    }).not.toThrow();
  });
  it("checks device kinds and deletes devices and approved links with their user", () => {
    const { db, ts } = seed();
    const device = (id: string, kind: string, hash: string) =>
      db.prepare("INSERT INTO devices (id, user_id, kind, name, token_hash, created_at, last_used_at) VALUES (?,'u1',?,'D',?,?,?)").run(id, kind, hash, ts, ts);
    device("d1", "watch", "h1");
    expect(() => device("d2", "tablet", "h2")).toThrow(/CHECK/);
    db.prepare(
      "INSERT INTO device_links (id, device_code_hash, user_code, kind, name, approved_by, created_at, expires_at) VALUES ('l1','dh1','BCDFGHJK','watch','W','u1',?,?)",
    ).run(ts, ts);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare("SELECT COUNT(*) FROM devices").pluck().get()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM device_links").pluck().get()).toBe(0);
  });
});
