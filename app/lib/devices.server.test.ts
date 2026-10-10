import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db.server";
import { authenticateDevice, createDevice, isDeviceKind, listDevices, parseDeviceName, revokeDevice } from "./devices.server";
import { sha256Hex } from "./ids.server";
import { deleteUser, upsertUser } from "./users.server";

let db: Db;
let userId: string;
let otherId: string;
const T0 = new Date("2026-10-10T10:00:00.000Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

beforeEach(() => {
  db = openDatabase(":memory:");
  userId = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "Owner", avatarUrl: null }).id;
  otherId = upsertUser(db, { provider: "github", providerId: "2", email: null, name: "Other", avatarUrl: null }).id;
});

describe("createDevice and authenticateDevice", () => {
  it("issues a pu_ token and stores only its hash", () => {
    const { device, token } = createDevice(db, userId, "watch", "Pixel Watch 3", T0);
    expect(token).toMatch(/^pu_[A-Za-z0-9_-]{43}$/);
    expect(device).toMatchObject({ userId, kind: "watch", name: "Pixel Watch 3", createdAt: T0.toISOString(), lastUsedAt: T0.toISOString() });
    const stored = db.prepare("SELECT token_hash FROM devices WHERE id = ?").pluck().get(device.id);
    expect(stored).toBe(sha256Hex(token));
  });
  it("finds the device and its user by token", () => {
    const { device, token } = createDevice(db, userId, "phone", "Pixel 9", T0);
    const caller = authenticateDevice(db, token, minutes(1));
    expect(caller?.device.id).toBe(device.id);
    expect(caller?.user.id).toBe(userId);
  });
  it("rejects unknown, malformed and revoked tokens", () => {
    const { device, token } = createDevice(db, userId, "phone", "Pixel 9", T0);
    expect(authenticateDevice(db, `${token}x`, T0)).toBeNull();
    expect(authenticateDevice(db, token.slice(3), T0)).toBeNull();
    expect(authenticateDevice(db, "", T0)).toBeNull();
    revokeDevice(db, userId, device.id);
    expect(authenticateDevice(db, token, T0)).toBeNull();
  });
  it("writes last_used_at at most once an hour", () => {
    const { device, token } = createDevice(db, userId, "watch", "W", T0);
    expect(authenticateDevice(db, token, minutes(59))?.device.lastUsedAt).toBe(T0.toISOString());
    expect(authenticateDevice(db, token, minutes(61))?.device.lastUsedAt).toBe(minutes(61).toISOString());
    expect(db.prepare("SELECT last_used_at FROM devices WHERE id = ?").pluck().get(device.id)).toBe(minutes(61).toISOString());
  });
});

describe("listDevices and revokeDevice", () => {
  it("lists only the user's devices, newest first", () => {
    createDevice(db, userId, "phone", "Old phone", T0);
    createDevice(db, userId, "watch", "New watch", minutes(5));
    createDevice(db, otherId, "phone", "Not mine", minutes(10));
    expect(listDevices(db, userId).map((d) => d.name)).toEqual(["New watch", "Old phone"]);
  });
  it("revokes only the user's own device", () => {
    const { device } = createDevice(db, otherId, "phone", "Not mine", T0);
    expect(revokeDevice(db, userId, device.id)).toBe(false);
    expect(revokeDevice(db, otherId, device.id)).toBe(true);
    expect(revokeDevice(db, otherId, device.id)).toBe(false);
  });
  it("goes away with the account", () => {
    const { token } = createDevice(db, userId, "watch", "W", T0);
    deleteUser(db, userId);
    expect(authenticateDevice(db, token, T0)).toBeNull();
    expect(listDevices(db, userId)).toEqual([]);
  });
});

describe("input checks", () => {
  it("accepts the two kinds", () => {
    expect(isDeviceKind("phone")).toBe(true);
    expect(isDeviceKind("watch")).toBe(true);
    expect(isDeviceKind("tablet")).toBe(false);
    expect(isDeviceKind(undefined)).toBe(false);
  });
  it("trims names and keeps them between 1 and 60 characters", () => {
    expect(parseDeviceName("  Pixel Watch 3 ")).toBe("Pixel Watch 3");
    expect(parseDeviceName("x".repeat(60))).toBe("x".repeat(60));
    expect(parseDeviceName("x".repeat(61))).toBeNull();
    expect(parseDeviceName("   ")).toBeNull();
    expect(parseDeviceName(42)).toBeNull();
  });
  it("rejects control and format characters such as newlines, bidi overrides and zero-width spaces", () => {
    expect(parseDeviceName("Pixel\nWatch")).toBeNull();
    expect(parseDeviceName("Pixel\u202EWatch")).toBeNull();
    expect(parseDeviceName("Pixel\u200BWatch")).toBeNull();
    expect(parseDeviceName("Pixel Watch 3")).toBe("Pixel Watch 3");
  });
});
