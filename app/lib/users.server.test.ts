import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db.server";
import { deleteUser, findUserById, upsertUser } from "./users.server";

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

const base = { provider: "github" as const, providerId: "42", email: "a@b.c", name: "Ada", avatarUrl: null };

describe("upsertUser", () => {
  it("creates a user with a 16-char id", () => {
    const u = upsertUser(db, base);
    expect(u.id).toHaveLength(16);
    expect(u.name).toBe("Ada");
    expect(findUserById(db, u.id)).toEqual(u);
  });
  it("updates name, email and avatar on the same provider identity, keeping the id", () => {
    const first = upsertUser(db, base);
    const second = upsertUser(db, { ...base, name: "Ada L.", email: null, avatarUrl: "https://x/a.png" });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Ada L.");
    expect(second.email).toBeNull();
    expect(second.avatarUrl).toBe("https://x/a.png");
  });
  it("never merges accounts by email", () => {
    const a = upsertUser(db, base);
    const b = upsertUser(db, { ...base, provider: "google", providerId: "sub-1" });
    expect(a.id).not.toBe(b.id);
  });
  it("findUserById returns null for unknown ids", () => {
    expect(findUserById(db, "nope")).toBeNull();
  });
});

describe("deleteUser", () => {
  it("removes the user and cascades to jars, fines and settlements", async () => {
    const { createJar, addFine, settle } = await import("./jars.server");
    const user = upsertUser(db, base);
    const jar = createJar(db, user.id, { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "public", publicSlug: null });
    addFine(db, jar.id, null);
    settle(db, jar.id, null);
    addFine(db, jar.id, null);
    expect(deleteUser(db, user.id)).toBe(true);
    expect(findUserById(db, user.id)).toBeNull();
    for (const table of ["jars", "fines", "settlements"]) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(deleteUser(db, user.id)).toBe(false);
  });
});
