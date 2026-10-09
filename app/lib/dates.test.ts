import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, formatDate, formatTime, groupByDay } from "./dates";

const now = new Date("2026-10-08T10:00:00Z");

describe("dayKey", () => {
  it("uses the given zone", () => {
    expect(dayKey(new Date("2026-10-07T23:30:00Z"), "Europe/Madrid")).toBe("2026-10-08");
    expect(dayKey(new Date("2026-10-07T23:30:00Z"), "America/Los_Angeles")).toBe("2026-10-07");
  });
});

describe("dayLabel", () => {
  const fine = "2026-10-07T23:30:00Z";
  it("is Today in Madrid and Yesterday in Los Angeles for the same instant", () => {
    expect(dayLabel(fine, now, "Europe/Madrid", "en-GB")).toBe("Today");
    expect(dayLabel(fine, now, "America/Los_Angeles", "en-GB")).toBe("Yesterday");
  });
  it("prints day and month in the locale for older days", () => {
    expect(dayLabel("2026-10-01T12:00:00Z", now, "Europe/Madrid", "en-GB")).toBe("1 October");
    expect(dayLabel("2026-10-01T12:00:00Z", now, "Europe/Madrid", "es-ES")).toBe("1 de octubre");
  });
  it("adds the year when it differs", () => {
    expect(dayLabel("2025-12-31T12:00:00Z", now, "Europe/Madrid", "en-GB")).toBe("31 December 2025");
  });
});

describe("formatters", () => {
  it("formatTime is 24h in es-ES", () => {
    expect(formatTime("2026-10-08T12:02:00Z", "Europe/Madrid", "es-ES")).toBe("14:02");
  });
  it("formatDate prints day and month in the same year", () => {
    expect(formatDate("2026-10-01T12:00:00Z", now, "Europe/Madrid", "en-GB")).toBe("1 October");
  });
  it("formatDate adds the year when it differs (final review, Important 2)", () => {
    expect(formatDate("2025-12-31T12:00:00Z", now, "Europe/Madrid", "en-GB")).toBe("31 December 2025");
  });
});

describe("groupByDay", () => {
  it("keeps order and groups consecutive same-day items", () => {
    const items = [
      { id: "a", createdAt: "2026-10-08T09:00:00Z" },
      { id: "b", createdAt: "2026-10-08T08:00:00Z" },
      { id: "c", createdAt: "2026-10-07T08:00:00Z" },
    ];
    const groups = groupByDay(items, now, "Europe/Madrid", "en-GB");
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });
  it("returns an empty array for no items", () => {
    expect(groupByDay([], now, "UTC", "en-GB")).toEqual([]);
  });
});
