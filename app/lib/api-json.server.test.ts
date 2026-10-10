import { describe, expect, it } from "vitest";
import { deviceJson, jarJson } from "./api-json.server";

describe("API shapes", () => {
  it("jarJson adds the public URL", () => {
    const jar = {
      id: "j1", ownerId: "u1", publicSlug: "doom-jar", title: "Doom jar", description: "", fineAmount: 100, currency: "EUR",
      visibility: "public" as const, createdAt: "2026-10-10T10:00:00.000Z", updatedAt: "2026-10-10T10:00:00.000Z", unsettledTotal: 300, unsettledCount: 3,
    };
    expect(jarJson(jar, "https://payup.example")).toEqual({
      id: "j1", title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "public", publicSlug: "doom-jar",
      publicUrl: "https://payup.example/j/doom-jar", unsettledTotal: 300, unsettledCount: 3,
      createdAt: "2026-10-10T10:00:00.000Z", updatedAt: "2026-10-10T10:00:00.000Z",
    });
  });
  it("deviceJson marks the calling device", () => {
    const device = { id: "d1", userId: "u1", kind: "watch" as const, name: "W", createdAt: "a", lastUsedAt: "b" };
    expect(deviceJson(device, "d1")).toEqual({ id: "d1", kind: "watch", name: "W", createdAt: "a", lastUsedAt: "b", current: true });
    expect(deviceJson(device, "d2").current).toBe(false);
  });
});
