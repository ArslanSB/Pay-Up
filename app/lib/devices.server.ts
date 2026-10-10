import type { Db } from "./db.server";
import { newId, newSecret, sha256Hex } from "./ids.server";
import { findUserById, type User } from "./users.server";

export type DeviceKind = "phone" | "watch";

export interface Device {
  id: string;
  userId: string;
  kind: DeviceKind;
  name: string;
  createdAt: string;
  lastUsedAt: string;
}

export const DEVICE_NAME_MAX = 60;
/** Lets secret scanners recognise a leaked token. */
export const TOKEN_PREFIX = "pu_";
const TOUCH_AFTER_MS = 60 * 60 * 1000;

interface DeviceRow {
  id: string;
  user_id: string;
  kind: DeviceKind;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string;
}

function rowToDevice(row: DeviceRow): Device {
  return { id: row.id, userId: row.user_id, kind: row.kind, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export function isDeviceKind(value: unknown): value is DeviceKind {
  return value === "phone" || value === "watch";
}

export function parseDeviceName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return null;
  return name.length >= 1 && name.length <= DEVICE_NAME_MAX ? name : null;
}

/** Creates a device and returns its token. The token is shown once; only its hash is stored. */
export function createDevice(db: Db, userId: string, kind: DeviceKind, name: string, now: Date = new Date()): { device: Device; token: string } {
  const token = `${TOKEN_PREFIX}${newSecret()}`;
  const ts = now.toISOString();
  const device: Device = { id: newId(), userId, kind, name, createdAt: ts, lastUsedAt: ts };
  db.prepare("INSERT INTO devices (id, user_id, kind, name, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    device.id,
    userId,
    kind,
    name,
    sha256Hex(token),
    ts,
    ts,
  );
  return { device, token };
}

/** The device and user a bearer token belongs to. Writes last_used_at only when it is over an hour old. */
export function authenticateDevice(db: Db, token: string, now: Date = new Date()): { device: Device; user: User } | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = db.prepare<[string], DeviceRow>("SELECT * FROM devices WHERE token_hash = ?").get(sha256Hex(token));
  if (!row) return null;
  const user = findUserById(db, row.user_id);
  if (!user) return null;
  const device = rowToDevice(row);
  if (now.getTime() - Date.parse(row.last_used_at) > TOUCH_AFTER_MS) {
    device.lastUsedAt = now.toISOString();
    db.prepare("UPDATE devices SET last_used_at = ? WHERE id = ?").run(device.lastUsedAt, device.id);
  }
  return { device, user };
}

export function listDevices(db: Db, userId: string): Device[] {
  return db
    .prepare<[string], DeviceRow>("SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(userId)
    .map(rowToDevice);
}

export function revokeDevice(db: Db, userId: string, deviceId: string): boolean {
  return db.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").run(deviceId, userId).changes > 0;
}
