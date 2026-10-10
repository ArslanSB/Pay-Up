import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db.server";
import { authenticateDevice } from "./devices.server";
import { sha256Hex } from "./ids.server";
import { approveLink, cancelLink, findLink, formatUserCode, normalizeUserCode, pollLink, startLink } from "./links.server";
import { upsertUser } from "./users.server";

let db: Db;
let userId: string;
let otherId: string;
const T0 = new Date("2026-10-10T10:00:00.000Z");
const seconds = (n: number) => new Date(T0.getTime() + n * 1000);

beforeEach(() => {
  db = openDatabase(":memory:");
  userId = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "Owner", avatarUrl: null }).id;
  otherId = upsertUser(db, { provider: "github", providerId: "2", email: null, name: "Other", avatarUrl: null }).id;
});

describe("user codes", () => {
  it("normalizes case, spaces and the dash", () => {
    expect(normalizeUserCode("wdjb-mjht")).toBe("WDJBMJHT");
    expect(normalizeUserCode(" wdjb mjht ")).toBe("WDJBMJHT");
    expect(normalizeUserCode("WDJBMJHT")).toBe("WDJBMJHT");
  });
  it("rejects anything outside the alphabet or the length", () => {
    for (const raw of ["ABCD-EFGH", "WDJB", "WDJB-MJHTX", "WDJB-MJH1", "", null, 42]) expect(normalizeUserCode(raw)).toBeNull();
  });
  it("formats with a dash", () => {
    expect(formatUserCode("WDJBMJHT")).toBe("WDJB-MJHT");
  });
});

describe("startLink", () => {
  it("returns a device code, a user code and a 10-minute expiry, storing only the device code's hash", () => {
    const link = startLink(db, "watch", "Pixel Watch 3", T0);
    expect(link.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(normalizeUserCode(link.userCode)).toBe(link.userCode);
    expect(link.expiresAt).toBe("2026-10-10T10:10:00.000Z");
    expect(db.prepare("SELECT device_code_hash FROM device_links").pluck().get()).toBe(sha256Hex(link.deviceCode));
  });
  it("retries a user code that is already taken", () => {
    const codes = ["BBBBBBBB", "BBBBBBBB", "CCCCCCCC"];
    startLink(db, "watch", "First", T0, () => codes.shift()!);
    expect(startLink(db, "watch", "Second", T0, () => codes.shift()!).userCode).toBe("CCCCCCCC");
  });
  it("purges expired links", () => {
    startLink(db, "watch", "Old", T0);
    startLink(db, "watch", "New", seconds(601));
    expect(db.prepare("SELECT name FROM device_links").pluck().all()).toEqual(["New"]);
  });
});

describe("pollLink", () => {
  it("is pending until approved, then issues a token exactly once", () => {
    const link = startLink(db, "watch", "Pixel Watch 3", T0);
    expect(pollLink(db, link.deviceCode, seconds(5))).toEqual({ status: "pending" });
    expect(approveLink(db, link.userCode, userId, seconds(7))).toBe(true);
    const result = pollLink(db, link.deviceCode, seconds(10));
    if (result.status !== "approved") throw new Error(`expected approved, got ${result.status}`);
    expect(result.device).toMatchObject({ userId, kind: "watch", name: "Pixel Watch 3" });
    expect(result.user.id).toBe(userId);
    expect(authenticateDevice(db, result.token, seconds(11))?.device.id).toBe(result.device.id);
    expect(pollLink(db, link.deviceCode, seconds(20))).toEqual({ status: "expired" });
  });
  it("asks a device that polls too fast to slow down, allowing a second of jitter (Review Focus 1)", () => {
    const link = startLink(db, "watch", "W", T0);
    expect(pollLink(db, link.deviceCode, seconds(5))).toEqual({ status: "pending" });
    expect(pollLink(db, link.deviceCode, seconds(8.9))).toEqual({ status: "slow_down" });
    expect(pollLink(db, link.deviceCode, seconds(9.5))).toEqual({ status: "pending" });
  });
  it("reports unknown and expired device codes as expired", () => {
    const link = startLink(db, "watch", "W", T0);
    expect(pollLink(db, "nope", seconds(5))).toEqual({ status: "expired" });
    approveLink(db, link.userCode, userId, seconds(5));
    expect(pollLink(db, link.deviceCode, seconds(600))).toEqual({ status: "expired" });
  });
});

describe("findLink, approveLink and cancelLink", () => {
  it("finds an unexpired link and says whether it is approved", () => {
    const link = startLink(db, "phone", "Pixel 9", T0);
    expect(findLink(db, link.userCode, seconds(1))).toEqual({ kind: "phone", name: "Pixel 9", expiresAt: link.expiresAt, approved: false, approvedBy: null });
    approveLink(db, link.userCode, userId, seconds(2));
    expect(findLink(db, link.userCode, seconds(3))).toMatchObject({ approved: true, approvedBy: userId });
    expect(findLink(db, link.userCode, seconds(600))).toBeNull();
    expect(findLink(db, "BBBBBBBB", seconds(1))).toBeNull();
  });
  it("approves for one user (who may retry), and never after expiry", () => {
    const link = startLink(db, "watch", "W", T0);
    expect(approveLink(db, link.userCode, userId, seconds(1))).toBe(true);
    expect(approveLink(db, link.userCode, userId, seconds(2))).toBe(true);
    expect(approveLink(db, link.userCode, otherId, seconds(2))).toBe(false);
    const late = startLink(db, "watch", "Late", T0);
    expect(approveLink(db, late.userCode, userId, seconds(600))).toBe(false);
  });
  it("cancels a pending link, or one the same user approved, but not someone else's approval", () => {
    const pending = startLink(db, "watch", "W", T0);
    expect(cancelLink(db, pending.userCode, otherId, seconds(1))).toBe(true);
    expect(pollLink(db, pending.deviceCode, seconds(5))).toEqual({ status: "expired" });
    const approved = startLink(db, "watch", "W2", T0);
    approveLink(db, approved.userCode, userId, seconds(1));
    expect(cancelLink(db, approved.userCode, otherId, seconds(2))).toBe(false);
    expect(cancelLink(db, approved.userCode, userId, seconds(2))).toBe(true);
  });
});
