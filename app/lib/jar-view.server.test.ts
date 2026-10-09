import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.server";
import { buildJarView } from "./jar-view.server";
import { addFine, createJar, settle } from "./jars.server";
import { upsertUser } from "./users.server";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("buildJarView", () => {
  it("formats balance, groups and settlements in the viewer's locale and zone", () => {
    const db = openDatabase(":memory:");
    const owner = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "O", avatarUrl: null });
    const jar = createJar(db, owner.id, { title: "Negativity jar", description: "d", fineAmount: 100, currency: "EUR", visibility: "public", publicSlug: null });
    addFine(db, jar.id, "old");
    settle(db, jar.id, "holiday fund");
    addFine(db, jar.id, "the weather");
    const newest = addFine(db, jar.id, null)!;
    const view = buildJarView(db, jar, { now: new Date(), timeZone: "Europe/Madrid", locale: "es-ES" });
    expect(nbsp(view.jar.fineAmountLabel)).toBe("1,00 €");
    expect(view.balance).toEqual({ total: 200, count: 2 });
    expect(nbsp(view.balanceLabel)).toBe("2,00 €");
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].label).toBe("Today");
    expect(view.groups[0].fines.map((t) => t.note)).toEqual([null, "the weather"]);
    expect(view.groups[0].fines[0].timeLabel).toMatch(/^\d{1,2}:\d{2}$/);
    expect(view.newestFineId).toBe(newest.id);
    expect(view.settlements).toHaveLength(1);
    expect(view.settlements[0].label).toMatch(/^Settled /);
    expect(view.settlements[0].summary).toBe("1 fine, holiday fund");
    expect(nbsp(view.settlements[0].totalLabel)).toBe("1,00 €");
  });
  it("is empty for a fresh jar", () => {
    const db = openDatabase(":memory:");
    const owner = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "O", avatarUrl: null });
    const jar = createJar(db, owner.id, { title: "t", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    const view = buildJarView(db, jar, { now: new Date(), timeZone: "UTC", locale: "en-GB" });
    expect(view.groups).toEqual([]);
    expect(view.settlements).toEqual([]);
    expect(view.newestFineId).toBeNull();
  });
});
