import { isUniqueViolation, type Db } from "./db.server";
import { createDevice, type Device, type DeviceKind } from "./devices.server";
import { newId, newSecret, newUserCode, sha256Hex, USER_CODE_ALPHABET } from "./ids.server";
import { findUserById, type User } from "./users.server";

export const LINK_TTL_MS = 10 * 60 * 1000;
export const POLL_INTERVAL_S = 5;
/** Polls closer together than this get slow_down: the interval minus a second of network jitter. */
const SLOW_DOWN_BELOW_MS = (POLL_INTERVAL_S - 1) * 1000;
const CODE_ATTEMPTS = 5;
export const LINK_EXPIRED_MESSAGE = "That code has expired. Start again on your device.";

export interface StartedLink {
  deviceCode: string;
  /** Without the dash; formatUserCode adds it for display. */
  userCode: string;
  expiresAt: string;
}

export interface LinkInfo {
  kind: DeviceKind;
  name: string;
  expiresAt: string;
  approved: boolean;
  /** The user who approved it, if any. */
  approvedBy: string | null;
}

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "expired" }
  | { status: "approved"; token: string; device: Device; user: User };

interface LinkRow {
  id: string;
  device_code_hash: string;
  user_code: string;
  kind: DeviceKind;
  name: string;
  approved_by: string | null;
  created_at: string;
  expires_at: string;
  last_polled_at: string | null;
}

const USER_CODE_PATTERN = new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`);

/** "wdjb mjht", "WDJB-MJHT" and "WDJBMJHT" are the same code. */
export function normalizeUserCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]+/g, "");
  return USER_CODE_PATTERN.test(code) ? code : null;
}

export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function startLink(db: Db, kind: DeviceKind, name: string, now: Date = new Date(), userCode: () => string = newUserCode): StartedLink {
  const ts = now.toISOString();
  db.prepare("DELETE FROM device_links WHERE expires_at <= ?").run(ts);
  const deviceCode = newSecret();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS).toISOString();
  const insert = db.prepare(
    `INSERT INTO device_links (id, device_code_hash, user_code, kind, name, approved_by, created_at, expires_at, last_polled_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
  );
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = userCode();
    try {
      insert.run(newId(), sha256Hex(deviceCode), code, kind, name, ts, expiresAt);
      return { deviceCode, userCode: code, expiresAt };
    } catch (error) {
      if (!isUniqueViolation(error, "device_links.user_code")) throw error;
    }
  }
  throw new Error("Could not allocate a unique link code");
}

/** One poll from the device. An approved link issues its token and is deleted in the same transaction. */
export function pollLink(db: Db, deviceCode: string, now: Date = new Date()): PollResult {
  return db.transaction((): PollResult => {
    const row = db.prepare<[string], LinkRow>("SELECT * FROM device_links WHERE device_code_hash = ?").get(sha256Hex(deviceCode));
    if (!row || row.expires_at <= now.toISOString()) return { status: "expired" };
    if (row.last_polled_at && now.getTime() - Date.parse(row.last_polled_at) < SLOW_DOWN_BELOW_MS) return { status: "slow_down" };
    if (!row.approved_by) {
      db.prepare("UPDATE device_links SET last_polled_at = ? WHERE id = ?").run(now.toISOString(), row.id);
      return { status: "pending" };
    }
    const user = findUserById(db, row.approved_by);
    if (!user) return { status: "expired" };
    const { device, token } = createDevice(db, user.id, row.kind, row.name, now);
    db.prepare("DELETE FROM device_links WHERE id = ?").run(row.id);
    return { status: "approved", token, device, user };
  })();
}

export function findLink(db: Db, userCode: string, now: Date = new Date()): LinkInfo | null {
  const row = db
    .prepare<[string, string], LinkRow>("SELECT * FROM device_links WHERE user_code = ? AND expires_at > ?")
    .get(userCode, now.toISOString());
  return row ? { kind: row.kind, name: row.name, expiresAt: row.expires_at, approved: row.approved_by !== null, approvedBy: row.approved_by } : null;
}

/** Approves for this user. The same user approving again still succeeds; another user's approval does not. */
export function approveLink(db: Db, userCode: string, userId: string, now: Date = new Date()): boolean {
  return (
    db
      .prepare("UPDATE device_links SET approved_by = ? WHERE user_code = ? AND expires_at > ? AND (approved_by IS NULL OR approved_by = ?)")
      .run(userId, userCode, now.toISOString(), userId).changes > 0
  );
}

/** Deletes a pending link, or one this user approved; the device's next poll gets expired. */
export function cancelLink(db: Db, userCode: string, userId: string, now: Date = new Date()): boolean {
  return (
    db
      .prepare("DELETE FROM device_links WHERE user_code = ? AND expires_at > ? AND (approved_by IS NULL OR approved_by = ?)")
      .run(userCode, now.toISOString(), userId).changes > 0
  );
}
