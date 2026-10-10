import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { authenticateDevice, createDevice } from "../lib/devices.server";
import { createJar } from "../lib/jars.server";
import { findUserById } from "../lib/users.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as deviceAction } from "./api.v1.devices.$id";
import { loader as devicesLoader } from "./api.v1.devices";
import { action as meAction, loader as meLoader } from "./api.v1.me";

const BASE = "http://localhost:3000/api/v1";

describe("/api/v1/me", () => {
  it("returns the caller's user", async () => {
    const user = makeUser(getDb(), "Ada");
    const response = await meLoader(callArgs(apiRequest(`${BASE}/me`, { token: deviceTokenFor(user.id) })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: user.id, name: "Ada", email: null, avatarUrl: null, provider: "github" } });
  });
  it("401s without a token, uncached", async () => {
    const response = await meLoader(callArgs(apiRequest(`${BASE}/me`)));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("DELETE erases the account with its jars and devices, so every token stops working", async () => {
    const user = makeUser();
    const phone = deviceTokenFor(user.id, "phone");
    const watch = deviceTokenFor(user.id, "watch");
    createJar(getDb(), user.id, { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    expect((await meAction(callArgs(apiRequest(`${BASE}/me`, { method: "DELETE", token: phone })))).status).toBe(204);
    expect(findUserById(getDb(), user.id)).toBeNull();
    expect(getDb().prepare("SELECT COUNT(*) FROM jars WHERE owner_id = ?").pluck().get(user.id)).toBe(0);
    expect((await meLoader(callArgs(apiRequest(`${BASE}/me`, { token: watch })))).status).toBe(401);
  });
});

describe("/api/v1/devices", () => {
  it("lists the user's devices newest first and marks the caller", async () => {
    const user = makeUser();
    createDevice(getDb(), user.id, "watch", "Pixel Watch 3", new Date("2026-10-01T10:00:00.000Z"));
    const token = deviceTokenFor(user.id, "phone");
    deviceTokenFor(makeUser().id);
    const { devices } = await (await devicesLoader(callArgs(apiRequest(`${BASE}/devices`, { token })))).json();
    expect(devices.map((d: { name: string; current: boolean }) => [d.name, d.current])).toEqual([
      ["Test phone", true],
      ["Pixel Watch 3", false],
    ]);
  });
  it("revokes another device, or the caller itself with current", async () => {
    const user = makeUser();
    const token = deviceTokenFor(user.id, "phone");
    const { device: watch, token: watchToken } = createDevice(getDb(), user.id, "watch", "W");
    expect((await deviceAction(callArgs(apiRequest(`${BASE}/devices/x`, { method: "DELETE", token }), { id: watch.id }))).status).toBe(204);
    expect(authenticateDevice(getDb(), watchToken)).toBeNull();
    expect((await deviceAction(callArgs(apiRequest(`${BASE}/devices/current`, { method: "DELETE", token }), { id: "current" }))).status).toBe(204);
    expect(authenticateDevice(getDb(), token)).toBeNull();
  });
  it("404s a device that belongs to someone else", async () => {
    const { device } = createDevice(getDb(), makeUser().id, "watch", "W");
    const token = deviceTokenFor(makeUser().id);
    const response = await deviceAction(callArgs(apiRequest(`${BASE}/devices/x`, { method: "DELETE", token }), { id: device.id }));
    expect(response.status).toBe(404);
  });
});
