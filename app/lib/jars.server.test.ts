import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db.server";
import {
  acceptClientTime,
  addClientFine,
  addFine,
  createJar,
  deleteFine,
  deleteJar,
  getBalance,
  getHistory,
  getJarById,
  getJarForOwner,
  getJarSummaryForOwner,
  getPublicJarBySlug,
  isSlugAvailable,
  listJarsForOwner,
  settle,
  SlugTakenError,
  updateJar,
} from "./jars.server";
import { upsertUser } from "./users.server";

let db: Db;
let ownerId: string;
let otherId: string;

const input = { title: "Doom jar", description: "Every gripe costs 1 €", fineAmount: 100, currency: "EUR", visibility: "public" as const, publicSlug: null };

beforeEach(() => {
  db = openDatabase(":memory:");
  ownerId = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "Owner", avatarUrl: null }).id;
  otherId = upsertUser(db, { provider: "github", providerId: "2", email: null, name: "Other", avatarUrl: null }).id;
});

describe("createJar", () => {
  it("stores the input with a 16-char id and a slug derived from the title", () => {
    const jar = createJar(db, ownerId, input);
    expect(jar.id).toHaveLength(16);
    expect(jar.publicSlug).toBe("doom-jar");
    expect(jar).toMatchObject({ title: "Doom jar", fineAmount: 100, currency: "EUR", visibility: "public" });
    expect(getJarById(db, jar.id)).toEqual(jar);
  });
  it("appends a random suffix when the derived slug is taken, retrying on a second collision (Review Focus 3)", () => {
    createJar(db, ownerId, input);
    const second = createJar(db, otherId, input, () => "k7x2");
    expect(second.publicSlug).toBe("doom-jar-k7x2");
    const suffixes = ["k7x2", "m3np"];
    const third = createJar(db, ownerId, input, () => suffixes.shift()!);
    expect(third.publicSlug).toBe("doom-jar-m3np");
  });
  it("gives up after five collisions", () => {
    createJar(db, ownerId, input);
    createJar(db, ownerId, input, () => "k7x2");
    expect(() => createJar(db, ownerId, input, () => "k7x2")).toThrow(/slug/);
  });
  it("uses an explicit slug as given", () => {
    const jar = createJar(db, ownerId, { ...input, publicSlug: "my-doom" });
    expect(jar.publicSlug).toBe("my-doom");
  });
  it("throws SlugTakenError when an explicit slug is taken", () => {
    createJar(db, ownerId, { ...input, publicSlug: "my-doom" });
    expect(() => createJar(db, otherId, { ...input, publicSlug: "my-doom" })).toThrow(SlugTakenError);
  });
});

describe("isSlugAvailable", () => {
  it("is false for a taken slug unless that jar is excluded", () => {
    const jar = createJar(db, ownerId, input);
    expect(isSlugAvailable(db, "doom-jar")).toBe(false);
    expect(isSlugAvailable(db, "doom-jar", jar.id)).toBe(true);
    expect(isSlugAvailable(db, "free-slug")).toBe(true);
  });
});

describe("lookups", () => {
  it("getJarForOwner hides other people's jars", () => {
    const jar = createJar(db, ownerId, input);
    expect(getJarForOwner(db, jar.id, ownerId)?.id).toBe(jar.id);
    expect(getJarForOwner(db, jar.id, otherId)).toBeNull();
    expect(getJarForOwner(db, "missing", ownerId)).toBeNull();
  });
  it("getPublicJarBySlug returns only public jars", () => {
    const pub = createJar(db, ownerId, input);
    const priv = createJar(db, ownerId, { ...input, title: "Private jar", visibility: "private" });
    expect(getPublicJarBySlug(db, pub.publicSlug)?.id).toBe(pub.id);
    expect(getPublicJarBySlug(db, priv.publicSlug)).toBeNull();
    expect(getPublicJarBySlug(db, "nope")).toBeNull();
  });
  it("listJarsForOwner returns newest first with zero balances", () => {
    const a = createJar(db, ownerId, { ...input, title: "A jar" });
    const b = createJar(db, ownerId, { ...input, title: "B jar" });
    createJar(db, otherId, input);
    const list = listJarsForOwner(db, ownerId);
    expect(list.map((j) => j.id)).toEqual([b.id, a.id]);
    expect(list[0]).toMatchObject({ unsettledTotal: 0, unsettledCount: 0 });
  });
});

describe("updateJar / deleteJar", () => {
  it("updates fields and updated_at, keeping the same slug when unchanged", () => {
    const jar = createJar(db, ownerId, input);
    const updated = updateJar(db, jar.id, { ...input, title: "Swear jar", fineAmount: 50, visibility: "private", publicSlug: jar.publicSlug });
    expect(updated).toMatchObject({ title: "Swear jar", fineAmount: 50, visibility: "private", publicSlug: "doom-jar" });
    expect(updateJar(db, "missing", { ...input, publicSlug: "x-y-z" })).toBeNull();
  });
  it("changes the slug on request and frees the old one", () => {
    const jar = createJar(db, ownerId, input);
    const updated = updateJar(db, jar.id, { ...input, publicSlug: "new-doom" });
    expect(updated?.publicSlug).toBe("new-doom");
    expect(getPublicJarBySlug(db, "doom-jar")).toBeNull();
    expect(isSlugAvailable(db, "doom-jar")).toBe(true);
  });
  it("derives a fresh slug from the title when none is given", () => {
    const jar = createJar(db, ownerId, { ...input, publicSlug: "custom" });
    const updated = updateJar(db, jar.id, { ...input, title: "Renamed jar", publicSlug: null });
    expect(updated?.publicSlug).toBe("renamed-jar");
  });
  it("throws SlugTakenError when the requested slug belongs to another jar", () => {
    createJar(db, ownerId, { ...input, publicSlug: "taken-one" });
    const jar = createJar(db, ownerId, input);
    expect(() => updateJar(db, jar.id, { ...input, publicSlug: "taken-one" })).toThrow(SlugTakenError);
  });
  it("deleteJar removes the jar", () => {
    const jar = createJar(db, ownerId, input);
    expect(deleteJar(db, jar.id)).toBe(true);
    expect(getJarById(db, jar.id)).toBeNull();
    expect(deleteJar(db, jar.id)).toBe(false);
  });
});

describe("fines and settlements", () => {
  it("addFine snapshots the jar amount and returns null for a missing jar", () => {
    const jar = createJar(db, ownerId, input);
    const fine = addFine(db, jar.id, "the weather");
    expect(fine).toMatchObject({ jarId: jar.id, amount: 100, note: "the weather", settlementId: null });
    updateJar(db, jar.id, { ...input, fineAmount: 250, publicSlug: jar.publicSlug });
    expect(addFine(db, jar.id, null)?.amount).toBe(250);
    expect(getBalance(db, jar.id)).toEqual({ total: 350, count: 2 });
    expect(addFine(db, "missing", null)).toBeNull();
  });

  it("settle stamps only the unsettled fines and stores the total", () => {
    const jar = createJar(db, ownerId, input);
    addFine(db, jar.id, null);
    addFine(db, jar.id, "sighed");
    const settlement = settle(db, jar.id, "holiday fund");
    expect(settlement).toMatchObject({ total: 200, note: "holiday fund", fineCount: 2 });
    addFine(db, jar.id, null);
    expect(getBalance(db, jar.id)).toEqual({ total: 100, count: 1 });
    const history = getHistory(db, jar.id);
    expect(history.unsettled).toHaveLength(1);
    expect(history.settlements).toHaveLength(1);
    expect(history.settlements[0].fineCount).toBe(2);
  });

  it("settle with nothing owed returns null and creates nothing (Review Focus 4)", () => {
    const jar = createJar(db, ownerId, input);
    expect(settle(db, jar.id, null)).toBeNull();
    addFine(db, jar.id, null);
    expect(settle(db, jar.id, null)).not.toBeNull();
    expect(settle(db, jar.id, null)).toBeNull();
    expect(getHistory(db, jar.id).settlements).toHaveLength(1);
  });

  it("deleteFine refuses settled fines and reports missing ones", () => {
    const jar = createJar(db, ownerId, input);
    const other = createJar(db, ownerId, { ...input, title: "Other jar" });
    const fine = addFine(db, jar.id, null)!;
    expect(deleteFine(db, other.id, fine.id)).toBe("missing");
    expect(deleteFine(db, jar.id, "nope")).toBe("missing");
    expect(deleteFine(db, jar.id, fine.id)).toBe("deleted");
    const settled = addFine(db, jar.id, null)!;
    settle(db, jar.id, null);
    expect(deleteFine(db, jar.id, settled.id)).toBe("settled");
  });

  it("getHistory orders newest first", () => {
    const jar = createJar(db, ownerId, input);
    const a = addFine(db, jar.id, "a")!;
    const b = addFine(db, jar.id, "b")!;
    expect(getHistory(db, jar.id).unsettled.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("deleting a jar cascades to its fines and settlements", () => {
    const jar = createJar(db, ownerId, input);
    addFine(db, jar.id, null);
    settle(db, jar.id, null);
    deleteJar(db, jar.id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM fines").pluck().get()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM settlements").pluck().get()).toBe(0);
  });
});

describe("addClientFine", () => {
  const NOW = new Date("2026-10-10T12:00:00.000Z");
  it("adds a fine at the jar's current amount", () => {
    const jar = createJar(db, ownerId, input);
    const result = addClientFine(db, jar.id, { note: "on the wrist", clientId: "c-1", createdAt: null }, NOW);
    expect(result?.created).toBe(true);
    expect(result?.fine).toMatchObject({ jarId: jar.id, amount: 100, note: "on the wrist", settlementId: null, createdAt: NOW.toISOString() });
  });
  it("returns the original fine when a client id is replayed, even after the amount changed (Review Focus 2)", () => {
    const jar = createJar(db, ownerId, input);
    const first = addClientFine(db, jar.id, { note: null, clientId: "c-1", createdAt: null }, NOW)!;
    updateJar(db, jar.id, { ...input, fineAmount: 250, publicSlug: jar.publicSlug });
    const again = addClientFine(db, jar.id, { note: null, clientId: "c-1", createdAt: null }, NOW)!;
    expect(again.created).toBe(false);
    expect(again.fine).toEqual(first.fine);
    expect(getBalance(db, jar.id)).toEqual({ total: 100, count: 1 });
  });
  it("treats the same client id in another jar, or no client id, as new fines", () => {
    const a = createJar(db, ownerId, input);
    const b = createJar(db, ownerId, input);
    addClientFine(db, a.id, { note: null, clientId: "c-1", createdAt: null }, NOW);
    expect(addClientFine(db, b.id, { note: null, clientId: "c-1", createdAt: null }, NOW)?.created).toBe(true);
    addClientFine(db, a.id, { note: null, clientId: null, createdAt: null }, NOW);
    addClientFine(db, a.id, { note: null, clientId: null, createdAt: null }, NOW);
    expect(getBalance(db, a.id).count).toBe(3);
  });
  it("returns null for a missing jar", () => {
    expect(addClientFine(db, "nope", { note: null, clientId: null, createdAt: null }, NOW)).toBeNull();
  });
});

describe("acceptClientTime", () => {
  const NOW = new Date("2026-10-10T12:00:00.000Z");
  it("keeps a past time up to 7 days old, normalized to UTC", () => {
    expect(acceptClientTime("2026-10-08T09:30:00+02:00", NOW)).toBe("2026-10-08T07:30:00.000Z");
    expect(acceptClientTime("2026-10-03T12:00:00.000Z", NOW)).toBe("2026-10-03T12:00:00.000Z");
  });
  it("uses the server's time for future, too old or unreadable times", () => {
    for (const raw of ["2026-10-10T12:00:01.000Z", "2026-10-03T11:59:59.000Z", "yesterday", "", null]) {
      expect(acceptClientTime(raw, NOW)).toBe(NOW.toISOString());
    }
  });
});

describe("getJarSummaryForOwner", () => {
  it("returns the jar with its unsettled balance, only for its owner", () => {
    const jar = createJar(db, ownerId, input);
    addFine(db, jar.id, null);
    addFine(db, jar.id, null);
    expect(getJarSummaryForOwner(db, jar.id, ownerId)).toMatchObject({ id: jar.id, unsettledTotal: 200, unsettledCount: 2 });
    expect(getJarSummaryForOwner(db, jar.id, otherId)).toBeNull();
    expect(getJarSummaryForOwner(db, "nope", ownerId)).toBeNull();
  });
});
