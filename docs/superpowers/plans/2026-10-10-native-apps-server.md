# Native Apps: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Pay Up server what the Android phone and Wear OS apps need: a JSON API at `/api/v1` with per-device tokens, device sign-in by link code, and the web pages that go with it (`/link`, `/link/phone`, `/devices`, `/delete-account`, the privacy update and `/.well-known/assetlinks.json`).

**Architecture:** The API is a set of React Router resource routes that call the same `app/lib` functions as the web pages. Devices authenticate with `Authorization: Bearer pu_…`; only a SHA-256 hash of each token is stored. A device signs in by starting a link (secret device code plus a short user code), the user approves the short code on the web or in the phone app, and the device polls until it receives its token once. The web app is not rewritten; it gains three pages and a returnTo on sign-in.

**Tech Stack:** Node 22.22+, TypeScript 5.9, React Router 8.4 (framework mode), better-sqlite3 13, zod 4.6, Vitest 5, Express 5 (`server.js`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-native-apps-design.md` (sections 5.1 to 5.5). The web app's original spec, `docs/superpowers/specs/2026-10-08-tip-jar-design.md`, still holds where this one is silent.

## Global Constraints

- Work on the `native-apps` branch. Node `>=22.22.0` (the machine has 23.2). No new npm dependencies and no version upgrades.
- Money is integer minor units. Timestamps are ISO 8601 UTC strings from `Date.prototype.toISOString()`. Any function whose result depends on the clock takes `now: Date = new Date()` as its last parameter so tests can pin time.
- Server-only modules end in `.server.ts`. Components import them only with `import type`.
- Relative imports only. No path aliases.
- Every API response goes through `apiJson`, `apiNoContent` or `apiError` (Task 6), so it carries `Cache-Control: no-store`. Every API loader and action is wrapped in `api(…)`. API routes never read the session cookie, and send no CORS headers.
- A jar, fine or device that belongs to someone else is a 404, never a 403, in the API and on the web.
- Messages are reused verbatim from the web: "Title is required.", "Amount must be more than 0.", "Pick a currency.", "Pick private or public.", "Use 3 to 40 lowercase letters, digits or dashes.", "That link is taken.", "Note must be 140 characters or fewer.", "That fine is already settled.", "Nothing to settle yet.". New copy from spec section 8: "That code has expired. Start again on your device.", "Linked. Your watch is ready.", "Link watch", "Link phone", "Cancel", "Revoke", "Revoke {name}? It will be signed out.", "No phones or watches yet. Get Pay Up on Google Play.".
- New web pages reuse the existing classes in `app/app.css` (`panel`, `btn`, `btn-ink`, `btn-pink`, `btn-ghost`, `raised`, `raised-lg`, `display`, `tnum`, `tilt`, `link`). No new CSS. Sentence case, no all-caps labels, no middle-dot separators.
- Run `npm test` after every task, and `npm run typecheck` after any task that adds a route or changes a type.
- Commit after every task with the message shown, ending with the attribution footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not bump `package.json`'s version until Task 16.

## Review Focus

1. A watch polling about 5 s apart, with network jitter making one gap 4.5 s, must still get its token rather than an endless `slow_down`. Test in Task 3.
2. A fine replayed with the same `clientId` after the jar's amount changed must return the original fine, not add a second one at the new amount. Test in Task 4.
3. A code typed on the web page in lowercase, with a space, or without the dash (`wdjb mjht`) must still find the link. Test in Task 12.
4. A `returnTo` that a browser would turn into another host (`/\t/evil.example`, `/\evil.example`, `//evil.example`) must land on `/jars`. Test in Task 11.
5. An offline fine that reaches the server after a settle, carrying a time from before it, must land unsettled in the balance, never inside the settled total. Test in Task 10.

---

## File structure

```
app/
  lib/
    db.server.ts              + migration 2; isUniqueViolation moves here from jars.server.ts
    ids.server.ts             + newSecret, newUserCode, sha256Hex, USER_CODE_ALPHABET
    devices.server.ts         NEW  device tokens: create, authenticate, list, revoke
    links.server.ts           NEW  link codes: start, poll, find, approve, cancel
    jars.server.ts            + addClientFine, acceptClientTime, getJarSummaryForOwner
    money.ts                  MAX_MINOR exported
    validation.ts             + parseJarJson; field rules shared with parseJarForm; parseNote takes unknown
    api.server.ts             NEW  JSON responses, errors, api() wrapper, requireDevice, body parsing
    api-json.server.ts        NEW  JSON shapes for users, devices, jars, fines, settlements
    rate-limit.server.ts      NEW  in-memory fixed-window limiter
    http.server.ts            + safeReturnTo
    session.server.ts         OAuthTransient gains returnTo
    link-page.server.ts       NEW  loader and action shared by /link and /link/phone
    copy.ts                   + lastUsedLabel
    env.server.ts             + androidCertFingerprints
    assetlinks.server.ts      NEW  Digital Asset Links response
  components/
    SignInButtons.tsx         NEW  provider buttons and consent line, with optional returnTo
    LinkApproval.tsx          NEW  the five states of the link page
    ConfirmButton.tsx         + optional hidden fields
  routes/
    api.v1.links.ts                   POST start a link
    api.v1.links.token.ts             POST poll
    api.v1.links.$code.ts             GET link info, DELETE cancel (phone app)
    api.v1.links.$code.approve.ts     POST approve (phone app)
    api.v1.me.ts                      GET, DELETE
    api.v1.devices.ts                 GET
    api.v1.devices.$id.ts             DELETE
    api.v1.jars.ts                    GET, POST
    api.v1.jars.$id.ts                GET, PUT, DELETE
    api.v1.jars.$id.fines.ts          POST
    api.v1.jars.$id.fines.$fineId.ts  DELETE
    api.v1.jars.$id.settlements.ts    POST
    api.v1.slugs.$slug.ts             GET
    link.tsx, link.phone.tsx          /link, /link/phone
    devices.tsx                       /devices
    delete-account.tsx                /delete-account
    assetlinks.ts                     /.well-known/assetlinks.json
    home.tsx, jars.tsx, privacy.tsx, auth.$provider.tsx, auth.$provider.callback.tsx   modified
  routes.ts                   + the routes above
  test/helpers.ts             + apiRequest, deviceTokenFor
server.js                     + x-payup-client-ip header
.env.example, README.md       + ANDROID_CERT_FINGERPRINTS
```

Tests sit next to the file they test as `*.test.ts`. Route tests call loaders and actions directly with a `Request`, as the existing ones do.

---

### Task 1: Schema and secrets

**Files:**
- Modify: `app/lib/db.server.ts` (append to `MIGRATIONS`)
- Modify: `app/lib/ids.server.ts`
- Test: `app/lib/db.server.test.ts`, `app/lib/ids.server.test.ts`

**Interfaces:**
- Produces: tables `devices`, `device_links`, column `fines.client_id` with unique index `fines_client`; `newSecret(): string`, `newUserCode(): string`, `sha256Hex(value: string): string`, `USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"`.

- [ ] **Step 1: Install dependencies and check the baseline**

Run: `npm ci && npm test`
Expected: all existing tests pass.

- [ ] **Step 2: Write the failing schema tests**

In `app/lib/db.server.test.ts`, change the import to `import { nowIso, openDatabase, type Db } from "./db.server";`. In the first test change the expectations to:

```ts
    expect(tables).toEqual(["device_links", "devices", "fines", "jars", "settlements", "users"]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("user_version", { simple: true })).toBe(2);
```

In "is idempotent" change `toBe(1)` to `toBe(2)`. Append:

```ts
describe("migration 2: devices, links and client fine ids", () => {
  function seed() {
    const db = openDatabase(":memory:");
    const ts = nowIso();
    db.prepare("INSERT INTO users (id, provider, provider_id, name, created_at) VALUES ('u1','github','1','T',?)").run(ts);
    for (const [id, slug] of [["j1", "slug-one"], ["j2", "slug-two"]]) {
      db.prepare(
        "INSERT INTO jars (id, owner_id, public_slug, title, fine_amount, currency, visibility, created_at, updated_at) VALUES (?,'u1',?,'T',100,'EUR','private',?,?)",
      ).run(id, slug, ts, ts);
    }
    return { db, ts };
  }
  const fine = (db: Db, id: string, jar: string, clientId: string | null) =>
    db.prepare("INSERT INTO fines (id, jar_id, amount, created_at, client_id) VALUES (?, ?, 100, ?, ?)").run(id, jar, nowIso(), clientId);

  it("keeps client ids unique per jar but allows any number of fines without one", () => {
    const { db } = seed();
    fine(db, "f1", "j1", "c-1");
    expect(() => fine(db, "f2", "j1", "c-1")).toThrow(/UNIQUE/);
    expect(() => fine(db, "f3", "j2", "c-1")).not.toThrow();
    expect(() => {
      fine(db, "f4", "j1", null);
      fine(db, "f5", "j1", null);
    }).not.toThrow();
  });
  it("checks device kinds and deletes devices and approved links with their user", () => {
    const { db, ts } = seed();
    const device = (id: string, kind: string, hash: string) =>
      db.prepare("INSERT INTO devices (id, user_id, kind, name, token_hash, created_at, last_used_at) VALUES (?,'u1',?,'D',?,?,?)").run(id, kind, hash, ts, ts);
    device("d1", "watch", "h1");
    expect(() => device("d2", "tablet", "h2")).toThrow(/CHECK/);
    db.prepare(
      "INSERT INTO device_links (id, device_code_hash, user_code, kind, name, approved_by, created_at, expires_at) VALUES ('l1','dh1','BCDFGHJK','watch','W','u1',?,?)",
    ).run(ts, ts);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare("SELECT COUNT(*) FROM devices").pluck().get()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM device_links").pluck().get()).toBe(0);
  });
});
```

- [ ] **Step 3: Write the failing secrets tests**

In `app/lib/ids.server.test.ts`, change the import to `import { newId, newSecret, newSlugSuffix, newUserCode, sha256Hex, SLUG_ALPHABET, USER_CODE_ALPHABET } from "./ids.server";` and append:

```ts
describe("secrets", () => {
  it("newSecret is 32 random bytes in base64url", () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSecret()).not.toBe(secret);
  });
  it("newUserCode is 8 characters from the consonant alphabet", () => {
    expect(USER_CODE_ALPHABET).toBe("BCDFGHJKLMNPQRSTVWXZ");
    for (let i = 0; i < 200; i++) expect(newUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
  });
  it("sha256Hex hashes to lowercase hex", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run app/lib/db.server.test.ts app/lib/ids.server.test.ts`
Expected: FAIL. The table list and `user_version` differ, and `newSecret` is not exported.

- [ ] **Step 5: Add migration 2**

In `app/lib/db.server.ts`, add a second string to the `MIGRATIONS` array, after the first one:

```ts
  `
  CREATE TABLE devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('phone', 'watch')),
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );
  CREATE INDEX devices_user ON devices(user_id);
  CREATE TABLE device_links (
    id               TEXT PRIMARY KEY,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code        TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL CHECK (kind IN ('phone', 'watch')),
    name             TEXT NOT NULL,
    approved_by      TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    last_polled_at   TEXT
  );
  ALTER TABLE fines ADD COLUMN client_id TEXT;
  CREATE UNIQUE INDEX fines_client ON fines(jar_id, client_id) WHERE client_id IS NOT NULL;
  `,
```

- [ ] **Step 6: Add the secret helpers**

In `app/lib/ids.server.ts`, change the import to `import { createHash, randomBytes, randomInt } from "node:crypto";` and append:

```ts
/** Consonants only: no accidental words, no look-alikes. Link codes read like WDJB-MJHT. */
export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

/** 32 random bytes, base64url. Device tokens and link device codes. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The short code a person types or compares, without its dash. */
export function newUserCode(): string {
  return draw(USER_CODE_ALPHABET, 8);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 8: Commit**

```bash
git add app/lib/db.server.ts app/lib/db.server.test.ts app/lib/ids.server.ts app/lib/ids.server.test.ts
git commit -m "feat: schema for devices, link codes and client fine ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Device tokens

**Files:**
- Create: `app/lib/devices.server.ts`
- Test: `app/lib/devices.server.test.ts`

**Interfaces:**
- Consumes: `newId`, `newSecret`, `sha256Hex` (Task 1); `findUserById`, `User` from `users.server.ts`.
- Produces:
  - `type DeviceKind = "phone" | "watch"`
  - `interface Device { id: string; userId: string; kind: DeviceKind; name: string; createdAt: string; lastUsedAt: string }`
  - `isDeviceKind(value: unknown): value is DeviceKind`
  - `parseDeviceName(raw: unknown): string | null` (trimmed, 1 to 60 characters)
  - `createDevice(db: Db, userId: string, kind: DeviceKind, name: string, now?: Date): { device: Device; token: string }`
  - `authenticateDevice(db: Db, token: string, now?: Date): { device: Device; user: User } | null`
  - `listDevices(db: Db, userId: string): Device[]` (newest first)
  - `revokeDevice(db: Db, userId: string, deviceId: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/devices.server.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/devices.server.test.ts`
Expected: FAIL, cannot find module `./devices.server`.

- [ ] **Step 3: Implement**

Create `app/lib/devices.server.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/devices.server.ts app/lib/devices.server.test.ts
git commit -m "feat: device tokens, stored as hashes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Link codes

**Files:**
- Create: `app/lib/links.server.ts`
- Modify: `app/lib/db.server.ts` (gains `isUniqueViolation`), `app/lib/jars.server.ts` (imports it instead of defining it)
- Modify: `docs/superpowers/specs/2026-10-10-native-apps-design.md` (section 5.2, step 3)
- Test: `app/lib/links.server.test.ts`

**Interfaces:**
- Consumes: `createDevice`, `Device`, `DeviceKind` (Task 2); `newId`, `newSecret`, `newUserCode`, `sha256Hex`, `USER_CODE_ALPHABET` (Task 1); `findUserById`, `User`.
- Produces:
  - `isUniqueViolation(error: unknown, column: string): boolean` exported from `db.server.ts`
  - `LINK_TTL_MS = 600000`, `POLL_INTERVAL_S = 5`, `LINK_EXPIRED_MESSAGE = "That code has expired. Start again on your device."`
  - `interface StartedLink { deviceCode: string; userCode: string; expiresAt: string }` (`userCode` without the dash)
  - `interface LinkInfo { kind: DeviceKind; name: string; expiresAt: string; approved: boolean }`
  - `type PollResult = { status: "pending" } | { status: "slow_down" } | { status: "expired" } | { status: "approved"; token: string; device: Device; user: User }`
  - `normalizeUserCode(raw: unknown): string | null`, `formatUserCode(code: string): string`
  - `startLink(db, kind, name, now?, userCode?: () => string): StartedLink`
  - `pollLink(db, deviceCode: string, now?): PollResult`
  - `findLink(db, userCode: string, now?): LinkInfo | null` (unexpired links only)
  - `approveLink(db, userCode: string, userId: string, now?): boolean`
  - `cancelLink(db, userCode: string, userId: string, now?): boolean`

- [ ] **Step 1: Move `isUniqueViolation` to `db.server.ts`**

Cut the `isUniqueViolation` function out of `app/lib/jars.server.ts` and paste it into `app/lib/db.server.ts` with `export`:

```ts
export function isUniqueViolation(error: unknown, column: string): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.includes(column)
  );
}
```

Change the first import of `jars.server.ts` to `import { isUniqueViolation, nowIso, type Db } from "./db.server";`.

Run: `npm test`
Expected: PASS (pure move).

- [ ] **Step 2: Write the failing tests**

Create `app/lib/links.server.test.ts`:

```ts
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
    expect(findLink(db, link.userCode, seconds(1))).toEqual({ kind: "phone", name: "Pixel 9", expiresAt: link.expiresAt, approved: false });
    approveLink(db, link.userCode, userId, seconds(2));
    expect(findLink(db, link.userCode, seconds(3))?.approved).toBe(true);
    expect(findLink(db, link.userCode, seconds(600))).toBeNull();
    expect(findLink(db, "BBBBBBBB", seconds(1))).toBeNull();
  });
  it("approves once, and never after expiry", () => {
    const link = startLink(db, "watch", "W", T0);
    expect(approveLink(db, link.userCode, userId, seconds(1))).toBe(true);
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/lib/links.server.test.ts`
Expected: FAIL, cannot find module `./links.server`.

- [ ] **Step 4: Implement**

Create `app/lib/links.server.ts`:

```ts
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
  return row ? { kind: row.kind, name: row.name, expiresAt: row.expires_at, approved: row.approved_by !== null } : null;
}

export function approveLink(db: Db, userCode: string, userId: string, now: Date = new Date()): boolean {
  return (
    db
      .prepare("UPDATE device_links SET approved_by = ? WHERE user_code = ? AND expires_at > ? AND approved_by IS NULL")
      .run(userId, userCode, now.toISOString()).changes > 0
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Record the jitter allowance in the spec**

In `docs/superpowers/specs/2026-10-10-native-apps-design.md`, section 5.2 step 3, replace
`` - `429` with code `slow_down` when polled sooner than `interval` after the previous poll.``
with
`` - `429` with code `slow_down` when polled more than a second sooner than `interval` after the previous poll (the second allows for network jitter).``

- [ ] **Step 7: Commit**

```bash
git add app/lib/links.server.ts app/lib/links.server.test.ts app/lib/db.server.ts app/lib/jars.server.ts docs/superpowers/specs/2026-10-10-native-apps-design.md
git commit -m "feat: link codes for signing in phones and watches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client fines and single-jar summaries

**Files:**
- Modify: `app/lib/jars.server.ts`
- Modify: `docs/superpowers/specs/2026-10-10-native-apps-design.md` (section 5.4, fine details)
- Test: `app/lib/jars.server.test.ts`

**Interfaces:**
- Consumes: existing `Fine`, `FineRow`, `rowToFine`, `getJarById`, `JarSummary`, `JarSummaryRow`, `rowToJar`.
- Produces:
  - `CLIENT_TIME_WINDOW_MS = 604800000`
  - `acceptClientTime(raw: string | null, now: Date): string`
  - `interface ClientFineInput { note: string | null; clientId: string | null; createdAt: string | null }`
  - `addClientFine(db: Db, jarId: string, input: ClientFineInput, now?: Date): { fine: Fine; created: boolean } | null`
  - `getJarSummaryForOwner(db: Db, id: string, ownerId: string): JarSummary | null`

- [ ] **Step 1: Write the failing tests**

In `app/lib/jars.server.test.ts`, add `acceptClientTime`, `addClientFine` and `getJarSummaryForOwner` to the import list from `./jars.server`, and append:

```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/jars.server.test.ts`
Expected: FAIL, the three functions are not exported.

- [ ] **Step 3: Implement the summary query**

In `app/lib/jars.server.ts`, replace the whole `listJarsForOwner` function with:

```ts
const SUMMARY_COLUMNS = `j.*,
  COALESCE((SELECT SUM(t.amount) FROM fines t WHERE t.jar_id = j.id AND t.settlement_id IS NULL), 0) AS unsettled_total,
  (SELECT COUNT(*) FROM fines t WHERE t.jar_id = j.id AND t.settlement_id IS NULL) AS unsettled_count`;

function rowToSummary(row: JarSummaryRow): JarSummary {
  return { ...rowToJar(row), unsettledTotal: row.unsettled_total, unsettledCount: row.unsettled_count };
}

export function listJarsForOwner(db: Db, ownerId: string): JarSummary[] {
  return db
    .prepare<[string], JarSummaryRow>(`SELECT ${SUMMARY_COLUMNS} FROM jars j WHERE j.owner_id = ? ORDER BY j.created_at DESC, j.rowid DESC`)
    .all(ownerId)
    .map(rowToSummary);
}

export function getJarSummaryForOwner(db: Db, id: string, ownerId: string): JarSummary | null {
  const row = db
    .prepare<[string, string], JarSummaryRow>(`SELECT ${SUMMARY_COLUMNS} FROM jars j WHERE j.id = ? AND j.owner_id = ?`)
    .get(id, ownerId);
  return row ? rowToSummary(row) : null;
}
```

- [ ] **Step 4: Implement client fines**

In `app/lib/jars.server.ts`, directly after the existing `addFine` function, add:

```ts
export const CLIENT_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Offline taps keep their real time when it is in the past and at most 7 days old; otherwise the server's time. */
export function acceptClientTime(raw: string | null, now: Date): string {
  const t = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(t) && t <= now.getTime() && now.getTime() - t <= CLIENT_TIME_WINDOW_MS) return new Date(t).toISOString();
  return now.toISOString();
}

export interface ClientFineInput {
  note: string | null;
  /** Random id the device gives each tap, so a retried send is stored once. */
  clientId: string | null;
  createdAt: string | null;
}

/** A fine from a native app. Replaying a clientId already in this jar returns that fine and inserts nothing. */
export function addClientFine(db: Db, jarId: string, input: ClientFineInput, now: Date = new Date()): { fine: Fine; created: boolean } | null {
  return db.transaction((): { fine: Fine; created: boolean } | null => {
    const jar = getJarById(db, jarId);
    if (!jar) return null;
    if (input.clientId) {
      const existing = db
        .prepare<[string, string], FineRow>("SELECT * FROM fines WHERE jar_id = ? AND client_id = ?")
        .get(jarId, input.clientId);
      if (existing) return { fine: rowToFine(existing), created: false };
    }
    const fine: Fine = {
      id: newId(),
      jarId,
      amount: jar.fineAmount,
      note: input.note,
      settlementId: null,
      createdAt: acceptClientTime(input.createdAt, now),
    };
    db.prepare("INSERT INTO fines (id, jar_id, amount, note, settlement_id, created_at, client_id) VALUES (?, ?, ?, ?, NULL, ?, ?)").run(
      fine.id,
      fine.jarId,
      fine.amount,
      fine.note,
      fine.createdAt,
      input.clientId,
    );
    return { fine, created: true };
  })();
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Record the function name in the spec**

In the spec, section 5.4 "Fine details", replace
`` - `addFine` gains an options argument `{ clientId, createdAt }` and returns whether it created the row. Existing web callers are unchanged.``
with
`` - A new `addClientFine` beside `addFine` takes `{ note, clientId, createdAt }` and returns the fine and whether it created the row. `addFine` and its web callers are unchanged.``

- [ ] **Step 7: Commit**

```bash
git add app/lib/jars.server.ts app/lib/jars.server.test.ts docs/superpowers/specs/2026-10-10-native-apps-design.md
git commit -m "feat: idempotent client fines with offline tap times, and single-jar summaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: JSON jar validation

**Files:**
- Modify: `app/lib/validation.ts`, `app/lib/money.ts`
- Test: `app/lib/validation.test.ts`

**Interfaces:**
- Consumes: `CURRENCIES`, `parseAmount`, `amountToInput` from `money.ts`; `isValidSlug`, `SLUG_MESSAGE` from `slugs.ts`.
- Produces:
  - `MAX_MINOR` exported from `money.ts`
  - `AMOUNT_MESSAGE = "Amount must be more than 0."`
  - `type JarJsonField = "title" | "description" | "fineAmount" | "currency" | "visibility" | "publicSlug"`, `type JarJsonErrors = Partial<Record<JarJsonField, string>>`
  - `parseJarJson(body: Record<string, unknown>): { ok: true; input: JarInput } | { ok: false; fields: JarJsonErrors }`
  - `parseNote(raw: unknown)` (was `FormDataEntryValue | null`; same behaviour)

- [ ] **Step 1: Write the failing tests**

In `app/lib/validation.test.ts`, change the import to `import { jarToFormValues, parseJarForm, parseJarJson, parseNote } from "./validation";` and append:

```ts
describe("parseJarJson", () => {
  const body = { title: " Doom jar ", description: "Every gripe", fineAmount: 150, currency: "EUR", visibility: "public" };
  it("accepts a good body, defaulting description and deriving the slug", () => {
    expect(parseJarJson(body)).toEqual({
      ok: true,
      input: { title: "Doom jar", description: "Every gripe", fineAmount: 150, currency: "EUR", visibility: "public", publicSlug: null },
    });
    expect(parseJarJson({ title: "T", fineAmount: 1, currency: "USD", visibility: "private", description: null, publicSlug: null })).toEqual({
      ok: true,
      input: { title: "T", description: "", fineAmount: 1, currency: "USD", visibility: "private", publicSlug: null },
    });
  });
  it("trims and lowercases an explicit slug", () => {
    const result = parseJarJson({ ...body, publicSlug: " My-Doom " });
    expect(result.ok && result.input.publicSlug).toBe("my-doom");
  });
  it("uses the web form's messages, keyed by JSON field names", () => {
    const result = parseJarJson({ title: "  ", description: "x".repeat(281), fineAmount: 0, currency: "BTC", visibility: "friends", publicSlug: "Doom Jar" });
    expect(result).toEqual({
      ok: false,
      fields: {
        title: "Title is required.",
        description: "Description must be 280 characters or fewer.",
        fineAmount: "Amount must be more than 0.",
        currency: "Pick a currency.",
        visibility: "Pick private or public.",
        publicSlug: "Use 3 to 40 lowercase letters, digits or dashes.",
      },
    });
  });
  it("rejects amounts that are not whole positive minor units, never coercing them", () => {
    for (const fineAmount of [-1, 1.5, "100", "1,50", null, undefined, 100_000_001]) {
      expect(parseJarJson({ ...body, fineAmount })).toMatchObject({ ok: false, fields: { fineAmount: "Amount must be more than 0." } });
    }
  });
  it("reports a missing title exactly as the form does", () => {
    const json = parseJarJson({ ...body, title: undefined });
    const web = parseJarForm(form({ ...good, title: "" }));
    if (json.ok || web.ok) throw new Error("expected both to fail");
    expect(json.fields.title).toBe(web.errors.title);
  });
});

describe("parseNote with JSON values", () => {
  it("treats absent or null as no note", () => {
    expect(parseNote(undefined)).toEqual({ ok: true, note: null });
    expect(parseNote(null)).toEqual({ ok: true, note: null });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/validation.test.ts`
Expected: FAIL, `parseJarJson` is not exported.

- [ ] **Step 3: Export `MAX_MINOR`**

In `app/lib/money.ts`, change `const MAX_MINOR = 100_000_000; // 1,000,000.00` to `export const MAX_MINOR = 100_000_000; // 1,000,000.00`.

- [ ] **Step 4: Rewrite `validation.ts`**

Replace the whole content of `app/lib/validation.ts` with:

```ts
import * as z from "zod";
import type { Jar, JarInput } from "./jars.server";
import { amountToInput, CURRENCIES, MAX_MINOR, parseAmount } from "./money";
import { isValidSlug, SLUG_MESSAGE, SLUG_TAKEN_MESSAGE } from "./slugs";

export { SLUG_MESSAGE, SLUG_TAKEN_MESSAGE };

export const AMOUNT_MESSAGE = "Amount must be more than 0.";
const TITLE_MESSAGE = "Title is required.";
const DESCRIPTION_MESSAGE = "Description must be 280 characters or fewer.";

export type JarField = "title" | "description" | "amount" | "currency" | "visibility" | "slug";
export type JarFormErrors = Partial<Record<JarField, string>>;
export interface JarFormValues {
  title: string;
  description: string;
  amount: string;
  currency: string;
  visibility: string;
  slug: string;
}

// Field rules shared by the web form and the JSON API, so both report the same messages.
const titleField = z.string(TITLE_MESSAGE).trim().min(1, TITLE_MESSAGE).max(60, "Title must be 60 characters or fewer.");
const descriptionField = z.string(DESCRIPTION_MESSAGE).trim().max(280, DESCRIPTION_MESSAGE);
const currencyField = z.enum(CURRENCIES, "Pick a currency.");
const visibilityField = z.enum(["private", "public"], "Pick private or public.");
const slugField = z
  .string(SLUG_MESSAGE)
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || isValidSlug(v), SLUG_MESSAGE);

const jarSchema = z.object({
  title: titleField,
  description: descriptionField,
  amount: z.string().refine((v) => parseAmount(v) !== null, AMOUNT_MESSAGE),
  currency: currencyField,
  visibility: visibilityField,
  slug: slugField,
});

const FIELDS: JarField[] = ["title", "description", "amount", "currency", "visibility", "slug"];

export function jarFormValues(form: FormData): JarFormValues {
  const read = (k: JarField) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    title: read("title"),
    description: read("description"),
    amount: read("amount"),
    currency: read("currency"),
    visibility: read("visibility"),
    slug: read("slug"),
  };
}

export function parseJarForm(form: FormData): { ok: true; input: JarInput } | { ok: false; errors: JarFormErrors; values: JarFormValues } {
  const values = jarFormValues(form);
  const result = jarSchema.safeParse(values);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const errors: JarFormErrors = {};
    for (const field of FIELDS) {
      const first = fieldErrors[field]?.[0];
      if (first) errors[field] = first;
    }
    return { ok: false, errors, values };
  }
  const d = result.data;
  return {
    ok: true,
    input: {
      title: d.title,
      description: d.description,
      fineAmount: parseAmount(d.amount) as number,
      currency: d.currency,
      visibility: d.visibility,
      publicSlug: d.slug === "" ? null : d.slug,
    },
  };
}

export type JarJsonField = "title" | "description" | "fineAmount" | "currency" | "visibility" | "publicSlug";
export type JarJsonErrors = Partial<Record<JarJsonField, string>>;

const jarJsonSchema = z.object({
  title: titleField,
  description: descriptionField,
  fineAmount: z.number(AMOUNT_MESSAGE).int(AMOUNT_MESSAGE).min(1, AMOUNT_MESSAGE).max(MAX_MINOR, AMOUNT_MESSAGE),
  currency: currencyField,
  visibility: visibilityField,
  publicSlug: slugField,
});

const JSON_FIELDS: JarJsonField[] = ["title", "description", "fineAmount", "currency", "visibility", "publicSlug"];

/** The API's jar body: the form's rules and messages, with the amount as integer minor units. */
export function parseJarJson(body: Record<string, unknown>): { ok: true; input: JarInput } | { ok: false; fields: JarJsonErrors } {
  const result = jarJsonSchema.safeParse({ ...body, description: body.description ?? "", publicSlug: body.publicSlug ?? "" });
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const fields: JarJsonErrors = {};
    for (const field of JSON_FIELDS) {
      const first = fieldErrors[field]?.[0];
      if (first) fields[field] = first;
    }
    return { ok: false, fields };
  }
  const d = result.data;
  return {
    ok: true,
    input: {
      title: d.title,
      description: d.description,
      fineAmount: d.fineAmount,
      currency: d.currency,
      visibility: d.visibility,
      publicSlug: d.publicSlug === "" ? null : d.publicSlug,
    },
  };
}

export function jarToFormValues(jar: Jar): JarFormValues {
  return {
    title: jar.title,
    description: jar.description,
    amount: amountToInput(jar.fineAmount),
    currency: jar.currency,
    visibility: jar.visibility,
    slug: jar.publicSlug,
  };
}

export function parseNote(raw: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 140) return { ok: false, error: "Note must be 140 characters or fewer." };
  return { ok: true, note: text.length === 0 ? null : text };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test && npm run typecheck`
Expected: PASS, including the existing `parseJarForm` tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/lib/validation.ts app/lib/validation.test.ts app/lib/money.ts
git commit -m "feat: parseJarJson shares the web form's rules and messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API plumbing

**Files:**
- Create: `app/lib/api.server.ts`, `app/lib/api-json.server.ts`
- Test: `app/lib/api.server.test.ts`, `app/lib/api-json.server.test.ts`

**Interfaces:**
- Consumes: `authenticateDevice`, `Device` (Task 2); `getJarForOwner`, `Jar`, `JarSummary`, `Fine`, `Settlement`; `SLUG_TAKEN_MESSAGE` from `slugs.ts`; `User`.
- Produces, from `api.server.ts`:
  - `apiJson(body: unknown, status?: number, headers?: Record<string, string>): Response`
  - `apiNoContent(): Response`
  - `type ApiErrorCode` (the codes in spec 5.3)
  - `apiError(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>, headers?: Record<string, string>): Response`
  - `api<A>(handler: (args: A) => Promise<Response> | Response): (args: A) => Promise<Response>`
  - `methodNotAllowed(allow: string[]): Response`
  - `interface Caller { device: Device; user: User }`, `requireDevice(request: Request, db: Db): Caller` (throws a 401 `Response`)
  - `MAX_BODY_BYTES = 16384`, `readJsonBody(request: Request): Promise<Record<string, unknown>>` (throws a 400 `Response`)
  - `optionalStringField(body: Record<string, unknown>, key: string): string | null` (throws a 400 `Response`)
  - `CLIENT_IP_HEADER = "x-payup-client-ip"`, `clientIp(request: Request): string`
  - `validationError(fields: Record<string, string>): Response`, `slugTakenError(): Response`, `jarNotFound(): Response`
  - `requireJar(db: Db, ownerId: string, jarId: string): Jar` (throws `jarNotFound()`)
- Produces, from `api-json.server.ts`: `userJson(user)`, `deviceJson(device, currentId: string)`, `jarJson(jar: JarSummary, appUrl: string)`, `fineJson(fine)`, `settlementJson(settlement)`, returning the shapes in spec 5.4.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/api.server.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "../test/helpers";
import {
  api,
  apiError,
  apiJson,
  apiNoContent,
  clientIp,
  methodNotAllowed,
  optionalStringField,
  readJsonBody,
  requireDevice,
  requireJar,
  slugTakenError,
  validationError,
} from "./api.server";
import { getDb } from "./db.server";
import { createDevice } from "./devices.server";
import { createJar } from "./jars.server";

afterEach(() => vi.restoreAllMocks());

async function thrownBy(fn: () => unknown): Promise<Response> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown Response");
}

const post = (body: string) => new Request("http://localhost:3000/api/v1/x", { method: "POST", body });

describe("responses", () => {
  it("are JSON and never cached", async () => {
    const response = apiJson({ a: 1 }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ a: 1 });
    expect(apiNoContent().status).toBe(204);
    expect(apiNoContent().headers.get("Cache-Control")).toBe("no-store");
  });
  it("shape errors with a code, a message and optional fields", async () => {
    expect(await apiError(404, "not_found", "Gone.").json()).toEqual({ error: { code: "not_found", message: "Gone." } });
    expect(await validationError({ title: "Title is required." }).json()).toEqual({
      error: { code: "validation", message: "Check the highlighted fields.", fields: { title: "Title is required." } },
    });
    const taken = slugTakenError();
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: { code: "slug_taken", message: "That link is taken.", fields: { publicSlug: "That link is taken." } } });
  });
  it("say which methods are allowed", async () => {
    const response = methodNotAllowed(["GET", "DELETE"]);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, DELETE");
    expect((await response.json()).error.code).toBe("method_not_allowed");
  });
});

describe("api wrapper", () => {
  it("returns thrown responses and turns anything else into a logged 500", async () => {
    const thrown = api(async () => {
      throw apiError(401, "unauthorized", "Sign in again.");
    });
    expect((await thrown({})).status).toBe(401);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = api(async () => {
      throw new Error("boom");
    });
    const response = await broken({});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "server_error", message: "Something went wrong." } });
    expect(log).toHaveBeenCalled();
  });
});

describe("requireDevice", () => {
  it("returns the caller for a valid bearer token, whatever the scheme's case", () => {
    const user = makeUser();
    const { device, token } = createDevice(getDb(), user.id, "watch", "W");
    const request = new Request("http://x/", { headers: { Authorization: `bearer ${token}` } });
    expect(requireDevice(request, getDb())).toMatchObject({ device: { id: device.id }, user: { id: user.id } });
  });
  it("throws a 401 otherwise", async () => {
    for (const headers of [{}, { Authorization: "Bearer pu_nope" }, { Authorization: "Basic abc" }]) {
      const response = await thrownBy(() => requireDevice(new Request("http://x/", { headers }), getDb()));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    }
  });
});

describe("requireJar", () => {
  it("returns the owner's jar and 404s anyone else's", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    expect(requireJar(getDb(), owner.id, jar.id).id).toBe(jar.id);
    const response = await thrownBy(() => requireJar(getDb(), makeUser().id, jar.id));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "not_found", message: "That jar doesn't exist." });
  });
});

describe("readJsonBody", () => {
  it("parses a JSON object and treats an empty body as {}", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(post(""))).toEqual({});
  });
  it("rejects arrays, junk, null and bodies over 16 KB with invalid_request", async () => {
    for (const body of ["[1]", "{nope", "null", JSON.stringify({ a: "x".repeat(17 * 1024) })]) {
      const response = await thrownBy(() => readJsonBody(post(body)));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
    }
  });
});

describe("small helpers", () => {
  it("reads the client address header, or a shared bucket", () => {
    expect(clientIp(new Request("http://x/", { headers: { "x-payup-client-ip": "203.0.113.9" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x/"))).toBe("unknown");
  });
  it("reads optional string fields and rejects other types", async () => {
    expect(optionalStringField({ note: "hi" }, "note")).toBe("hi");
    expect(optionalStringField({ note: null }, "note")).toBeNull();
    expect(optionalStringField({}, "note")).toBeNull();
    const response = await thrownBy(() => optionalStringField({ note: 42 }, "note"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({ code: "invalid_request", message: "note must be a string." });
  });
});
```

Create `app/lib/api-json.server.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/api.server.test.ts app/lib/api-json.server.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `api.server.ts`**

Create `app/lib/api.server.ts`:

```ts
import type { Db } from "./db.server";
import { authenticateDevice, type Device } from "./devices.server";
import { getJarForOwner, type Jar } from "./jars.server";
import { SLUG_TAKEN_MESSAGE } from "./slugs";
import type { User } from "./users.server";

export type ApiErrorCode =
  | "invalid_request"
  | "validation"
  | "unauthorized"
  | "not_found"
  | "method_not_allowed"
  | "slug_taken"
  | "already_settled"
  | "nothing_to_settle"
  | "expired"
  | "slow_down"
  | "rate_limited"
  | "server_error";

const NO_STORE = { "Cache-Control": "no-store" };

export function apiJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function apiNoContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export function apiError(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>, headers: Record<string, string> = {}): Response {
  return apiJson({ error: fields ? { code, message, fields } : { code, message } }, status, headers);
}

/** Wraps an API loader or action: thrown Responses are returned as they are, anything else becomes a logged 500. */
export function api<A>(handler: (args: A) => Promise<Response> | Response): (args: A) => Promise<Response> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[api] unexpected error", error);
      return apiError(500, "server_error", "Something went wrong.");
    }
  };
}

export function methodNotAllowed(allow: string[]): Response {
  return apiError(405, "method_not_allowed", `Use ${allow.join(" or ")}.`, undefined, { Allow: allow.join(", ") });
}

export function validationError(fields: Record<string, string>): Response {
  return apiError(400, "validation", "Check the highlighted fields.", fields);
}

export function slugTakenError(): Response {
  return apiError(409, "slug_taken", SLUG_TAKEN_MESSAGE, { publicSlug: SLUG_TAKEN_MESSAGE });
}

export function jarNotFound(): Response {
  return apiError(404, "not_found", "That jar doesn't exist.");
}

export interface Caller {
  device: Device;
  user: User;
}

/** The device behind `Authorization: Bearer pu_…`, or a thrown 401. API routes never read the session cookie. */
export function requireDevice(request: Request, db: Db): Caller {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "");
  const caller = match ? authenticateDevice(db, match[1]) : null;
  if (!caller) throw apiError(401, "unauthorized", "Sign in again.");
  return caller;
}

/** The caller's jar, or a thrown 404 for a missing or foreign one. */
export function requireJar(db: Db, ownerId: string, jarId: string): Jar {
  const jar = getJarForOwner(db, jarId, ownerId);
  if (!jar) throw jarNotFound();
  return jar;
}

export const MAX_BODY_BYTES = 16 * 1024;

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw apiError(400, "invalid_request", "Request body is too large.");
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw apiError(400, "invalid_request", "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw apiError(400, "invalid_request", "Request body must be a JSON object.");
  return parsed as Record<string, unknown>;
}

/** A body field that must be text when present: the string, null when absent or null, or a thrown 400. */
export function optionalStringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw apiError(400, "invalid_request", `${key} must be a string.`);
  return value;
}

/** Set by server.js from Express's req.ip (which honours TRUST_PROXY), overwriting anything the client sent. */
export const CLIENT_IP_HEADER = "x-payup-client-ip";

export function clientIp(request: Request): string {
  return request.headers.get(CLIENT_IP_HEADER) || "unknown";
}
```

- [ ] **Step 4: Implement `api-json.server.ts`**

Create `app/lib/api-json.server.ts`:

```ts
import type { Device } from "./devices.server";
import type { Fine, JarSummary, Settlement } from "./jars.server";
import type { User } from "./users.server";

// The JSON shapes of spec section 5.4. Money in minor units, times in UTC ISO strings, no formatted labels.

export function userJson(user: User) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, provider: user.provider };
}

export function deviceJson(device: Device, currentId: string) {
  return { id: device.id, kind: device.kind, name: device.name, createdAt: device.createdAt, lastUsedAt: device.lastUsedAt, current: device.id === currentId };
}

export function jarJson(jar: JarSummary, appUrl: string) {
  return {
    id: jar.id,
    title: jar.title,
    description: jar.description,
    fineAmount: jar.fineAmount,
    currency: jar.currency,
    visibility: jar.visibility,
    publicSlug: jar.publicSlug,
    publicUrl: `${appUrl}/j/${jar.publicSlug}`,
    unsettledTotal: jar.unsettledTotal,
    unsettledCount: jar.unsettledCount,
    createdAt: jar.createdAt,
    updatedAt: jar.updatedAt,
  };
}

export function fineJson(fine: Fine) {
  return { id: fine.id, amount: fine.amount, note: fine.note, createdAt: fine.createdAt };
}

export function settlementJson(settlement: Settlement) {
  return { id: settlement.id, total: settlement.total, note: settlement.note, fineCount: settlement.fineCount, createdAt: settlement.createdAt };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/api.server.ts app/lib/api.server.test.ts app/lib/api-json.server.ts app/lib/api-json.server.test.ts
git commit -m "feat: JSON API plumbing: responses, errors, bearer auth, body parsing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Link API routes, rate limit and the Origin gate

**Files:**
- Create: `app/lib/rate-limit.server.ts`, `app/routes/api.v1.links.ts`, `app/routes/api.v1.links.token.ts`, `app/routes/api.v1.links.$code.ts`, `app/routes/api.v1.links.$code.approve.ts`
- Modify: `app/routes.ts`, `server.js`, `app/test/helpers.ts`, `app/server.test.ts`
- Modify: `docs/superpowers/specs/2026-10-10-native-apps-design.md` (section 5.3, rate limit line)
- Test: `app/lib/rate-limit.server.test.ts`, `app/routes/api.v1.links.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 6.
- Produces:
  - `createRateLimiter({ limit, windowMs }): RateLimiter` with `hit(key: string, now?: number): boolean`; `linkStartLimiter` (10 per 10 minutes)
  - Test helpers `apiRequest(url, { method?, token?, body?, ip? }): Request` and `deviceTokenFor(userId, kind?, db?): string`
  - Routes `POST /api/v1/links`, `POST /api/v1/links/token`, `GET|DELETE /api/v1/links/:code`, `POST /api/v1/links/:code/approve`

- [ ] **Step 1: Write the failing rate limiter test**

Create `app/lib/rate-limit.server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.server";

describe("createRateLimiter", () => {
  it("allows the limit per key per window, then refuses until the window ends", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([limiter.hit("a", 0), limiter.hit("a", 10), limiter.hit("a", 20)]).toEqual([true, true, false]);
    expect(limiter.hit("b", 20)).toBe(true);
    expect(limiter.hit("a", 1000)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement the limiter**

Create `app/lib/rate-limit.server.ts`:

```ts
export interface RateLimiter {
  /** Counts one hit for the key; false once the key is over its limit for the current window. */
  hit(key: string, now?: number): boolean;
}

/** Fixed-window counter held in memory. Enough for the single server process this app runs as. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
        }
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    },
  };
}

/** POST /api/v1/links: 10 per client address per 10 minutes (spec 5.3). */
export const linkStartLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });
```

Run: `npx vitest run app/lib/rate-limit.server.test.ts`
Expected: PASS.

- [ ] **Step 3: Pass the client address from Express**

In `app/server.test.ts`, change the probe handler in `boot` to report the header:

```ts
    handler: (req, res) =>
      res.json({ protocol: req.protocol, host: req.hostname, hostHeader: req.get("host"), ip: req.ip, clientIp: req.get("x-payup-client-ip") }),
```

and add to the `describe` block:

```ts
  it("passes Express's view of the client address to the app, overwriting a client-sent value", async () => {
    const base = await boot({ trustProxy: "loopback, linklocal, uniquelocal", publicOrigin: null });
    const seen = await (await fetch(`${base}/probe`, { headers: { ...forwarded, "X-Payup-Client-Ip": "1.2.3.4" } })).json();
    expect(seen.clientIp).toBe("203.0.113.9");
  });
```

Run: `npx vitest run app/server.test.ts`
Expected: FAIL, `clientIp` is `1.2.3.4`.

In `server.js`, inside `createApp`, directly before `app.get("/healthz", …)`, add:

```js
  // The API rate-limits by client address. React Router only sees a Request, so hand it Express's view of the
  // address (which honours trust proxy) in a header, overwriting anything the client sent.
  app.use((req, _res, next) => {
    req.headers["x-payup-client-ip"] = req.ip ?? "";
    next();
  });
```

Run: `npx vitest run app/server.test.ts`
Expected: PASS.

- [ ] **Step 4: Add the API test helpers**

In `app/test/helpers.ts`, add `import { createDevice, type DeviceKind } from "../lib/devices.server";` and append:

```ts
/** A JSON API request. A body makes it a POST unless `method` says otherwise. */
export function apiRequest(url: string, options: { method?: string; token?: string; body?: unknown; ip?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.ip) headers["x-payup-client-ip"] = options.ip;
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  return new Request(url, { method: options.method ?? (body === undefined ? "GET" : "POST"), headers, body });
}

export function deviceTokenFor(userId: string, kind: DeviceKind = "phone", db: Db = getDb()): string {
  return createDevice(db, userId, kind, kind === "phone" ? "Test phone" : "Test watch").token;
}
```

- [ ] **Step 5: Write the failing route tests**

Create `app/routes/api.v1.links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { authenticateDevice } from "../lib/devices.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as codeAction, loader as codeLoader } from "./api.v1.links.$code";
import { action as approveAction } from "./api.v1.links.$code.approve";
import { action as startAction, loader as startLoader } from "./api.v1.links";
import { action as tokenAction } from "./api.v1.links.token";

const BASE = "http://localhost:3000/api/v1";
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

async function start(kind = "watch", name = "Pixel Watch 3") {
  const response = await startAction(callArgs(apiRequest(`${BASE}/links`, { body: { kind, name }, ip: freshIp() })));
  return { response, body: await response.json() };
}
const poll = (deviceCode: string) => tokenAction(callArgs(apiRequest(`${BASE}/links/token`, { body: { deviceCode } })));

describe("POST /api/v1/links", () => {
  it("starts a watch link pointing at /link and a phone link pointing at /link/phone", async () => {
    const watch = await start("watch");
    expect(watch.response.status).toBe(201);
    expect(watch.body).toMatchObject({ verificationUrl: "http://localhost:3000/link", interval: 5 });
    expect(watch.body.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(watch.body.verificationUrlComplete).toBe(`http://localhost:3000/link?code=${watch.body.userCode}`);
    expect(watch.body.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const phone = await start("phone", "Pixel 9");
    expect(phone.body.verificationUrlComplete).toBe(`http://localhost:3000/link/phone?code=${phone.body.userCode}`);
  });
  it("validates kind and name", async () => {
    const { response, body } = await start("tablet", " ");
    expect(response.status).toBe(400);
    expect(body.error).toEqual({
      code: "validation",
      message: "Check the highlighted fields.",
      fields: { kind: "Pick phone or watch.", name: "Name must be 1 to 60 characters." },
    });
  });
  it("allows 10 starts per address per 10 minutes", async () => {
    const ip = freshIp();
    const hit = () => startAction(callArgs(apiRequest(`${BASE}/links`, { body: { kind: "watch", name: "W" }, ip })));
    for (let i = 0; i < 10; i++) expect((await hit()).status).toBe(201);
    const limited = await hit();
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect((await start()).response.status).toBe(201);
  });
  it("answers GET with 405", async () => {
    expect((await startLoader(callArgs(apiRequest(`${BASE}/links`)))).status).toBe(405);
  });
});

describe("POST /api/v1/links/token", () => {
  it("is 202 while pending and 429 when polled too fast", async () => {
    const { body } = await start();
    expect((await poll(body.deviceCode)).status).toBe(202);
    const fast = await poll(body.deviceCode);
    expect(fast.status).toBe(429);
    expect((await fast.json()).error.code).toBe("slow_down");
  });
  it("issues the token once after the phone app approves, then 410", async () => {
    const user = makeUser();
    const phoneToken = deviceTokenFor(user.id, "phone");
    const { body } = await start("watch", "Pixel Watch 3");
    const approved = await approveAction(callArgs(apiRequest(`${BASE}/links/x/approve`, { method: "POST", token: phoneToken }), { code: body.userCode }));
    expect(approved.status).toBe(204);
    const issued = await poll(body.deviceCode);
    expect(issued.status).toBe(200);
    const json = await issued.json();
    expect(json.device).toMatchObject({ kind: "watch", name: "Pixel Watch 3", current: true });
    expect(json.user).toMatchObject({ id: user.id });
    expect(authenticateDevice(getDb(), json.token)?.device.id).toBe(json.device.id);
    const again = await poll(body.deviceCode);
    expect(again.status).toBe(410);
    expect((await again.json()).error).toEqual({ code: "expired", message: "That code has expired. Start again on your device." });
  });
  it("needs a device code", async () => {
    expect((await tokenAction(callArgs(apiRequest(`${BASE}/links/token`, { body: {} })))).status).toBe(400);
  });
});

describe("GET and DELETE /api/v1/links/:code", () => {
  it("tells the phone app which device is asking", async () => {
    const token = deviceTokenFor(makeUser().id);
    const { body } = await start("watch", "Pixel Watch 3");
    const response = await codeLoader(callArgs(apiRequest(`${BASE}/links/x`, { token }), { code: body.userCode.toLowerCase() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "watch", name: "Pixel Watch 3" });
  });
  it("needs a token and 404s an unknown code", async () => {
    const { body } = await start();
    expect((await codeLoader(callArgs(apiRequest(`${BASE}/links/x`), { code: body.userCode }))).status).toBe(401);
    const token = deviceTokenFor(makeUser().id);
    expect((await codeLoader(callArgs(apiRequest(`${BASE}/links/x`, { token }), { code: "BBBB-BBBB" }))).status).toBe(404);
  });
  it("cancels, after which the device gets 410", async () => {
    const token = deviceTokenFor(makeUser().id);
    const { body } = await start();
    expect((await codeAction(callArgs(apiRequest(`${BASE}/links/x`, { method: "DELETE", token }), { code: body.userCode }))).status).toBe(204);
    expect((await poll(body.deviceCode)).status).toBe(410);
  });
});
```

- [ ] **Step 6: Register the routes**

In `app/routes.ts`, after `route("api/slug", "routes/api.slug.ts"),` add:

```ts
  route("api/v1/links", "routes/api.v1.links.ts"),
  route("api/v1/links/token", "routes/api.v1.links.token.ts"),
  route("api/v1/links/:code", "routes/api.v1.links.$code.ts"),
  route("api/v1/links/:code/approve", "routes/api.v1.links.$code.approve.ts"),
```

- [ ] **Step 7: Implement the routes**

Create `app/routes/api.v1.links.ts`:

```ts
import type { Route } from "./+types/api.v1.links";
import { api, apiError, apiJson, clientIp, methodNotAllowed, readJsonBody, validationError } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { isDeviceKind, parseDeviceName } from "../lib/devices.server";
import { env } from "../lib/env.server";
import { formatUserCode, POLL_INTERVAL_S, startLink } from "../lib/links.server";
import { linkStartLimiter } from "../lib/rate-limit.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links { kind, name }: a phone or watch starts signing in (spec 5.2). No token needed. */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!linkStartLimiter.hit(clientIp(request))) return apiError(429, "rate_limited", "Too many sign-in attempts. Wait a few minutes.");
  const body = await readJsonBody(request);
  const kind = body.kind;
  const name = parseDeviceName(body.name);
  if (!isDeviceKind(kind) || name === null) {
    return validationError({
      ...(isDeviceKind(kind) ? {} : { kind: "Pick phone or watch." }),
      ...(name === null ? { name: "Name must be 1 to 60 characters." } : {}),
    });
  }
  const link = startLink(getDb(), kind, name);
  const appUrl = env().appUrl;
  const userCode = formatUserCode(link.userCode);
  const path = kind === "phone" ? "/link/phone" : "/link";
  return apiJson(
    {
      deviceCode: link.deviceCode,
      userCode,
      verificationUrl: `${appUrl}/link`,
      verificationUrlComplete: `${appUrl}${path}?code=${userCode}`,
      expiresAt: link.expiresAt,
      interval: POLL_INTERVAL_S,
    },
    201,
  );
});
```

Create `app/routes/api.v1.links.token.ts`:

```ts
import type { Route } from "./+types/api.v1.links.token";
import { api, apiError, apiJson, methodNotAllowed, readJsonBody } from "../lib/api.server";
import { deviceJson, userJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { LINK_EXPIRED_MESSAGE, pollLink } from "../lib/links.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links/token { deviceCode }: the device polls until its link is approved. */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const { deviceCode } = await readJsonBody(request);
  if (typeof deviceCode !== "string" || deviceCode === "") return apiError(400, "invalid_request", "deviceCode is required.");
  const result = pollLink(getDb(), deviceCode);
  if (result.status === "pending") return apiJson({ status: "pending" }, 202);
  if (result.status === "slow_down") return apiError(429, "slow_down", "Poll less often.");
  if (result.status === "expired") return apiError(410, "expired", LINK_EXPIRED_MESSAGE);
  return apiJson({ token: result.token, device: deviceJson(result.device, result.device.id), user: userJson(result.user) });
});
```

Create `app/routes/api.v1.links.$code.ts`:

```ts
import type { Route } from "./+types/api.v1.links.$code";
import { api, apiError, apiJson, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { cancelLink, findLink, LINK_EXPIRED_MESSAGE, normalizeUserCode } from "../lib/links.server";

/** GET /api/v1/links/:code: the phone app asks which device a watch's code belongs to. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  const link = code ? findLink(db, code) : null;
  if (!link || link.approved) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiJson({ kind: link.kind, name: link.name, expiresAt: link.expiresAt });
});

/** DELETE /api/v1/links/:code: the phone app cancels; the device's next poll gets 410. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["GET", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  if (!code || !cancelLink(db, code, user.id)) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiNoContent();
});
```

Create `app/routes/api.v1.links.$code.approve.ts`:

```ts
import type { Route } from "./+types/api.v1.links.$code.approve";
import { api, apiError, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { approveLink, LINK_EXPIRED_MESSAGE, normalizeUserCode } from "../lib/links.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links/:code/approve: the phone app approves a watch's code for its own user. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  if (!code || !approveLink(db, code, user.id)) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiNoContent();
});
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: The Origin gate (spec 5.4)**

The unit tests call actions directly and skip React Router's request handling. This step checks that the real handler lets an app's POST, PUT and DELETE through without an `Origin` header. Run:

```bash
npm run build
WORK=$(mktemp -d)
SESSION_SECRET=verify-secret-long-enough-123 APP_URL=http://localhost:3999 PORT=3999 DATABASE_PATH="$WORK/payup.db" NODE_ENV=production node server.js > "$WORK/server.log" 2>&1 &
echo $! > "$WORK/pid"
curl -s --retry 20 --retry-connrefused --retry-delay 1 http://localhost:3999/healthz; echo
curl -s -w ' %{http_code}\n' -X POST http://localhost:3999/api/v1/links -H 'Content-Type: application/json' -d '{"kind":"watch","name":"Gate"}'
curl -s -w ' %{http_code}\n' -X DELETE http://localhost:3999/api/v1/links/BBBB-BBBB
curl -s -w ' %{http_code}\n' -X PUT http://localhost:3999/api/v1/links -H 'Content-Type: application/json' -d '{}'
kill "$(cat "$WORK/pid")"; cat "$WORK/server.log"
```

Expected, in order: `ok`; a JSON body with `deviceCode` and `201`; `{"error":{"code":"unauthorized",…}} 401`; `{"error":{"code":"method_not_allowed",…}} 405`.

If any of those three API responses is not this JSON (for example a 400 or 403 in HTML or plain text), **stop and report to your human partner**. React Router is then rejecting requests without an Origin header, spec 5.4's fallback applies (mount the API in Express in `server.js`), and the rest of this plan needs revising before Task 8.

- [ ] **Step 10: Record how the address reaches the app**

In the spec, section 5.3, replace
`` The IP is Express's `req.ip` (which honours `TRUST_PROXY`), passed to React Router through the load context in `server.js`.``
with
`` The IP is Express's `req.ip` (which honours `TRUST_PROXY`), passed to React Router in an `x-payup-client-ip` header that `server.js` sets on every request, overwriting any value the client sent.``

- [ ] **Step 11: Commit**

```bash
git add app/lib/rate-limit.server.ts app/lib/rate-limit.server.test.ts app/routes/api.v1.links*.ts app/routes.ts server.js app/server.test.ts app/test/helpers.ts docs/superpowers/specs/2026-10-10-native-apps-design.md
git commit -m "feat: link API for devices, with a per-address rate limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Account and device API

**Files:**
- Create: `app/routes/api.v1.me.ts`, `app/routes/api.v1.devices.ts`, `app/routes/api.v1.devices.$id.ts`
- Modify: `app/routes.ts`
- Test: `app/routes/api.v1.account.test.ts`

**Interfaces:**
- Consumes: `api`, `apiJson`, `apiNoContent`, `apiError`, `methodNotAllowed`, `requireDevice` (Task 6); `userJson`, `deviceJson`; `listDevices`, `revokeDevice` (Task 2); `deleteUser`.
- Produces: `GET|DELETE /api/v1/me`, `GET /api/v1/devices`, `DELETE /api/v1/devices/:id` (`current` means the caller).

- [ ] **Step 1: Write the failing tests**

Create `app/routes/api.v1.account.test.ts`:

```ts
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
```

- [ ] **Step 2: Register the routes**

In `app/routes.ts`, after the link routes from Task 7, add:

```ts
  route("api/v1/me", "routes/api.v1.me.ts"),
  route("api/v1/devices", "routes/api.v1.devices.ts"),
  route("api/v1/devices/:id", "routes/api.v1.devices.$id.ts"),
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/routes/api.v1.account.test.ts`
Expected: FAIL, route modules not found.

- [ ] **Step 4: Implement**

Create `app/routes/api.v1.me.ts`:

```ts
import type { Route } from "./+types/api.v1.me";
import { api, apiJson, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { userJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { deleteUser } from "../lib/users.server";

export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const { user } = requireDevice(request, getDb());
  return apiJson({ user: userJson(user) });
});

/** DELETE /api/v1/me: erases the account and everything in it, devices included (Play's in-app deletion). */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["GET", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  deleteUser(db, user.id);
  return apiNoContent();
});
```

Create `app/routes/api.v1.devices.ts`:

```ts
import type { Route } from "./+types/api.v1.devices";
import { api, apiJson, methodNotAllowed, requireDevice } from "../lib/api.server";
import { deviceJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { listDevices } from "../lib/devices.server";

export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const db = getDb();
  const { device, user } = requireDevice(request, db);
  return apiJson({ devices: listDevices(db, user.id).map((d) => deviceJson(d, device.id)) });
});

export const action = api(async () => methodNotAllowed(["GET"]));
```

Create `app/routes/api.v1.devices.$id.ts`:

```ts
import type { Route } from "./+types/api.v1.devices.$id";
import { api, apiError, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { revokeDevice } from "../lib/devices.server";

export const loader = api(async () => methodNotAllowed(["DELETE"]));

/** DELETE /api/v1/devices/:id revokes one of the user's devices; `current` signs the caller out. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const db = getDb();
  const { device, user } = requireDevice(request, db);
  const id = params.id === "current" ? device.id : params.id;
  if (!revokeDevice(db, user.id, id)) return apiError(404, "not_found", "That device doesn't exist.");
  return apiNoContent();
});
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routes/api.v1.me.ts app/routes/api.v1.devices.ts app/routes/api.v1.devices.\$id.ts app/routes/api.v1.account.test.ts app/routes.ts
git commit -m "feat: account and device API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Jar API

**Files:**
- Create: `app/routes/api.v1.jars.ts`, `app/routes/api.v1.jars.$id.ts`, `app/routes/api.v1.slugs.$slug.ts`
- Modify: `app/routes.ts`
- Test: `app/routes/api.v1.jars.test.ts`

**Interfaces:**
- Consumes: Task 6 helpers (`api`, `apiJson`, `apiNoContent`, `methodNotAllowed`, `readJsonBody`, `requireDevice`, `requireJar`, `validationError`, `slugTakenError`, `jarNotFound`); `jarJson`, `fineJson`, `settlementJson`; `parseJarJson` (Task 5); `getJarSummaryForOwner` (Task 4); existing `createJar`, `updateJar`, `deleteJar`, `getHistory`, `getJarForOwner`, `isSlugAvailable`, `listJarsForOwner`, `SlugTakenError`; `isValidSlug`.
- Produces: `GET|POST /api/v1/jars`, `GET|PUT|DELETE /api/v1/jars/:id`, `GET /api/v1/slugs/:slug?jar=`.

- [ ] **Step 1: Write the failing tests**

Create `app/routes/api.v1.jars.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { addFine, createJar, getHistory, settle } from "../lib/jars.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as jarAction, loader as jarLoader } from "./api.v1.jars.$id";
import { action as jarsAction, loader as jarsLoader } from "./api.v1.jars";
import { loader as slugLoader } from "./api.v1.slugs.$slug";

const BASE = "http://localhost:3000/api/v1";
const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "public" as const, publicSlug: null as string | null };
const body = { title: "Doom jar", fineAmount: 100, currency: "EUR", visibility: "public" };

function owner() {
  const user = makeUser();
  return { user, token: deviceTokenFor(user.id) };
}
const create = (token: string, json: unknown) => jarsAction(callArgs(apiRequest(`${BASE}/jars`, { token, body: json })));
const jarCall = (method: string, token: string, id: string, json?: unknown) =>
  (method === "GET" ? jarLoader : jarAction)(callArgs(apiRequest(`${BASE}/jars/${id}`, { method, token, body: json }), { id }));

describe("GET /api/v1/jars", () => {
  it("lists the caller's jars newest first, with balances and public links", async () => {
    const { user, token } = owner();
    const older = createJar(getDb(), user.id, { ...input, title: "Older" });
    createJar(getDb(), user.id, { ...input, title: "Newer" });
    addFine(getDb(), older.id, null);
    createJar(getDb(), makeUser().id, { ...input, title: "Not mine" });
    const { jars } = await (await jarsLoader(callArgs(apiRequest(`${BASE}/jars`, { token })))).json();
    expect(jars.map((j: { title: string }) => j.title)).toEqual(["Newer", "Older"]);
    expect(jars[1]).toMatchObject({ unsettledTotal: 100, unsettledCount: 1, publicUrl: `http://localhost:3000/j/${older.publicSlug}` });
  });
  it("401s without a token", async () => {
    expect((await jarsLoader(callArgs(apiRequest(`${BASE}/jars`)))).status).toBe(401);
  });
});

describe("POST /api/v1/jars", () => {
  it("creates a jar with a link made from the title", async () => {
    const { token } = owner();
    const response = await create(token, { ...body, title: "Swear jar" });
    expect(response.status).toBe(201);
    const { jar } = await response.json();
    expect(jar).toMatchObject({ title: "Swear jar", fineAmount: 100, currency: "EUR", visibility: "public", unsettledTotal: 0, unsettledCount: 0 });
    expect(jar.publicSlug).toMatch(/^swear-jar/);
  });
  it("answers with the web form's messages", async () => {
    const { token } = owner();
    const response = await create(token, { ...body, title: " ", fineAmount: 0 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "validation", message: "Check the highlighted fields.", fields: { title: "Title is required.", fineAmount: "Amount must be more than 0." } },
    });
  });
  it("409s a link another jar holds", async () => {
    createJar(getDb(), makeUser().id, { ...input, publicSlug: "taken-link" });
    const response = await create(owner().token, { ...body, publicSlug: "taken-link" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("slug_taken");
  });
});

describe("/api/v1/jars/:id", () => {
  it("returns the jar with its unsettled fines and settlements, newest first", async () => {
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, input);
    addFine(getDb(), jar.id, null);
    addFine(getDb(), jar.id, null);
    settle(getDb(), jar.id, "holiday fund");
    addFine(getDb(), jar.id, "again");
    const json = await (await jarCall("GET", token, jar.id)).json();
    expect(json.jar).toMatchObject({ id: jar.id, unsettledTotal: 100, unsettledCount: 1 });
    expect(json.unsettled).toEqual([expect.objectContaining({ amount: 100, note: "again" })]);
    expect(json.settlements).toEqual([expect.objectContaining({ total: 200, fineCount: 2, note: "holiday fund" })]);
  });
  it("404s another user's jar on every method", async () => {
    const jar = createJar(getDb(), makeUser().id, input);
    const { token } = owner();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await jarCall(method, token, jar.id, method === "PUT" ? body : undefined);
      expect(response.status).toBe(404);
    }
  });
  it("PUT replaces the jar's fields and leaves existing fines at their amount", async () => {
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, input);
    addFine(getDb(), jar.id, null);
    const response = await jarCall("PUT", token, jar.id, { ...body, title: "Gripe jar", fineAmount: 250, visibility: "private", publicSlug: jar.publicSlug });
    expect(response.status).toBe(200);
    expect((await response.json()).jar).toMatchObject({ title: "Gripe jar", fineAmount: 250, visibility: "private", unsettledTotal: 100 });
    expect(getHistory(getDb(), jar.id).unsettled[0].amount).toBe(100);
  });
  it("PUT 409s a taken link", async () => {
    createJar(getDb(), makeUser().id, { ...input, publicSlug: "held-elsewhere" });
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, input);
    expect((await jarCall("PUT", token, jar.id, { ...body, publicSlug: "held-elsewhere" })).status).toBe(409);
  });
  it("DELETE removes the jar", async () => {
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, input);
    expect((await jarCall("DELETE", token, jar.id)).status).toBe(204);
    expect((await jarCall("GET", token, jar.id)).status).toBe(404);
  });
});

describe("GET /api/v1/slugs/:slug", () => {
  it("checks a link like the web form does", async () => {
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, { ...input, publicSlug: "my-own-link" });
    const check = async (slug: string, jarId?: string) =>
      (await slugLoader(callArgs(apiRequest(`${BASE}/slugs/${slug}${jarId ? `?jar=${jarId}` : ""}`, { token }), { slug }))).json();
    expect(await check("free-as-air")).toEqual({ slug: "free-as-air", valid: true, available: true });
    expect(await check("My-Own-Link")).toEqual({ slug: "my-own-link", valid: true, available: false });
    expect(await check("my-own-link", jar.id)).toEqual({ slug: "my-own-link", valid: true, available: true });
    expect(await check("no")).toEqual({ slug: "no", valid: false, available: false });
  });
});
```

- [ ] **Step 2: Register the routes**

In `app/routes.ts`, after the routes from Task 8, add:

```ts
  route("api/v1/jars", "routes/api.v1.jars.ts"),
  route("api/v1/jars/:id", "routes/api.v1.jars.$id.ts"),
  route("api/v1/slugs/:slug", "routes/api.v1.slugs.$slug.ts"),
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/routes/api.v1.jars.test.ts`
Expected: FAIL, route modules not found.

- [ ] **Step 4: Implement**

Create `app/routes/api.v1.jars.ts`:

```ts
import type { Route } from "./+types/api.v1.jars";
import { api, apiJson, methodNotAllowed, readJsonBody, requireDevice, slugTakenError, validationError } from "../lib/api.server";
import { jarJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { createJar, getJarSummaryForOwner, listJarsForOwner, SlugTakenError } from "../lib/jars.server";
import { parseJarJson } from "../lib/validation";

/** GET /api/v1/jars: the dashboard list, newest first like the web, so tile colors match. */
export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const appUrl = env().appUrl;
  return apiJson({ jars: listJarsForOwner(db, user.id).map((jar) => jarJson(jar, appUrl)) });
});

export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const parsed = parseJarJson(await readJsonBody(request));
  if (!parsed.ok) return validationError(parsed.fields);
  try {
    const jar = createJar(db, user.id, parsed.input);
    return apiJson({ jar: jarJson(getJarSummaryForOwner(db, jar.id, user.id)!, env().appUrl) }, 201);
  } catch (error) {
    if (error instanceof SlugTakenError) return slugTakenError();
    throw error;
  }
});
```

Create `app/routes/api.v1.jars.$id.ts`:

```ts
import type { Route } from "./+types/api.v1.jars.$id";
import {
  api,
  apiJson,
  apiNoContent,
  jarNotFound,
  methodNotAllowed,
  readJsonBody,
  requireDevice,
  requireJar,
  slugTakenError,
  validationError,
} from "../lib/api.server";
import { fineJson, jarJson, settlementJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { deleteJar, getHistory, getJarSummaryForOwner, SlugTakenError, updateJar } from "../lib/jars.server";
import { parseJarJson } from "../lib/validation";

/** GET /api/v1/jars/:id: the jar, its unsettled fines and its settlements, newest first. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = getJarSummaryForOwner(db, params.id, user.id);
  if (!jar) return jarNotFound();
  const history = getHistory(db, jar.id);
  return apiJson({
    jar: jarJson(jar, env().appUrl),
    unsettled: history.unsettled.map(fineJson),
    settlements: history.settlements.map(settlementJson),
  });
});

export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "PUT" && request.method !== "DELETE") return methodNotAllowed(["GET", "PUT", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  if (request.method === "DELETE") {
    deleteJar(db, jar.id);
    return apiNoContent();
  }
  const parsed = parseJarJson(await readJsonBody(request));
  if (!parsed.ok) return validationError(parsed.fields);
  try {
    updateJar(db, jar.id, parsed.input);
  } catch (error) {
    if (error instanceof SlugTakenError) return slugTakenError();
    throw error;
  }
  return apiJson({ jar: jarJson(getJarSummaryForOwner(db, jar.id, user.id)!, env().appUrl) });
});
```

Create `app/routes/api.v1.slugs.$slug.ts`:

```ts
import type { Route } from "./+types/api.v1.slugs.$slug";
import { api, apiJson, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { getJarForOwner, isSlugAvailable } from "../lib/jars.server";
import { isValidSlug } from "../lib/slugs";

/** GET /api/v1/slugs/:slug?jar=<own jar id>: the same advisory check as /api/slug. Saving still enforces uniqueness. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const slug = params.slug.trim().toLowerCase();
  const jarParam = new URL(request.url).searchParams.get("jar");
  const ownJar = jarParam ? getJarForOwner(db, jarParam, user.id) : null;
  const valid = isValidSlug(slug);
  return apiJson({ slug, valid, available: valid && isSlugAvailable(db, slug, ownJar?.id) });
});

export const action = api(async () => methodNotAllowed(["GET"]));
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routes/api.v1.jars.ts app/routes/api.v1.jars.\$id.ts app/routes/api.v1.slugs.\$slug.ts app/routes/api.v1.jars.test.ts app/routes.ts
git commit -m "feat: jar API with the web's rules and messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Fine and settlement API

**Files:**
- Create: `app/routes/api.v1.jars.$id.fines.ts`, `app/routes/api.v1.jars.$id.fines.$fineId.ts`, `app/routes/api.v1.jars.$id.settlements.ts`
- Modify: `app/routes.ts`
- Test: `app/routes/api.v1.fines.test.ts`

**Interfaces:**
- Consumes: Task 6 helpers (`optionalStringField`, `requireJar`, `validationError`, …); `fineJson`, `settlementJson`; `addClientFine` (Task 4); `parseNote` (Task 5); existing `deleteFine`, `getBalance`, `settle`.
- Produces: `POST /api/v1/jars/:id/fines`, `DELETE /api/v1/jars/:id/fines/:fineId`, `POST /api/v1/jars/:id/settlements`.

- [ ] **Step 1: Write the failing tests**

Create `app/routes/api.v1.fines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { addFine, createJar, getHistory, settle, updateJar } from "../lib/jars.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as fineAction } from "./api.v1.jars.$id.fines.$fineId";
import { action as finesAction } from "./api.v1.jars.$id.fines";
import { action as settleAction } from "./api.v1.jars.$id.settlements";

const BASE = "http://localhost:3000/api/v1";
const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private" as const, publicSlug: null };

function setup() {
  const user = makeUser();
  const token = deviceTokenFor(user.id, "watch");
  const jar = createJar(getDb(), user.id, input);
  return { user, token, jar };
}
const tap = (token: string, jarId: string, json: unknown) =>
  finesAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/fines`, { token, body: json }), { id: jarId }));
const undo = (token: string, jarId: string, fineId: string) =>
  fineAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/fines/${fineId}`, { method: "DELETE", token }), { id: jarId, fineId }));
const settleUp = (token: string, jarId: string, json: unknown = {}) =>
  settleAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/settlements`, { token, body: json }), { id: jarId }));

describe("POST /api/v1/jars/:id/fines", () => {
  it("adds a fine at the jar's current amount and returns the new balance", async () => {
    const { token, jar } = setup();
    updateJar(getDb(), jar.id, { ...input, fineAmount: 150, publicSlug: jar.publicSlug });
    const response = await tap(token, jar.id, { note: " on the wrist " });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.fine).toMatchObject({ amount: 150, note: "on the wrist" });
    expect(json.balance).toEqual({ total: 150, count: 1 });
  });
  it("stores a replayed tap once", async () => {
    const { token, jar } = setup();
    const clientId = "0b7c4f2e-1111-4a2b-9c3d-123456789abc";
    const first = await (await tap(token, jar.id, { clientId })).json();
    const again = await tap(token, jar.id, { clientId });
    expect(again.status).toBe(200);
    const json = await again.json();
    expect(json.fine.id).toBe(first.fine.id);
    expect(json.balance).toEqual({ total: 100, count: 1 });
  });
  it("keeps a recent offline tap's time", async () => {
    const { token, jar } = setup();
    const createdAt = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    expect((await (await tap(token, jar.id, { createdAt })).json()).fine.createdAt).toBe(createdAt);
  });
  it("counts an offline tap that arrives after a settle as unsettled, even with an earlier time (Review Focus 5)", async () => {
    const { token, jar } = setup();
    const tappedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    addFine(getDb(), jar.id, null);
    settle(getDb(), jar.id, null);
    const json = await (await tap(token, jar.id, { clientId: "late-tap", createdAt: tappedAt })).json();
    expect(json.balance).toEqual({ total: 100, count: 1 });
    expect(getHistory(getDb(), jar.id).settlements[0]).toMatchObject({ total: 100, fineCount: 1 });
  });
  it("validates the note and client id, and rejects a note that is not text", async () => {
    const { token, jar } = setup();
    const long = await tap(token, jar.id, { note: "n".repeat(141), clientId: "has spaces" });
    expect(long.status).toBe(400);
    expect((await long.json()).error.fields).toEqual({ note: "Note must be 140 characters or fewer.", clientId: "Use 1 to 64 letters, digits or dashes." });
    const typed = await tap(token, jar.id, { note: 42 });
    expect(typed.status).toBe(400);
    expect((await typed.json()).error.code).toBe("invalid_request");
  });
  it("404s another user's jar", async () => {
    const { jar } = setup();
    expect((await tap(deviceTokenFor(makeUser().id), jar.id, {})).status).toBe(404);
  });
});

describe("DELETE /api/v1/jars/:id/fines/:fineId", () => {
  it("removes an unsettled fine, 409s a settled one and 404s a missing one", async () => {
    const { token, jar } = setup();
    const keep = addFine(getDb(), jar.id, null)!;
    const response = await undo(token, jar.id, keep.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balance: { total: 0, count: 0 } });
    const settled = addFine(getDb(), jar.id, null)!;
    settle(getDb(), jar.id, null);
    const refused = await undo(token, jar.id, settled.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toEqual({ code: "already_settled", message: "That fine is already settled." });
    expect((await undo(token, jar.id, "nope")).status).toBe(404);
  });
});

describe("POST /api/v1/jars/:id/settlements", () => {
  it("settles once, then says there is nothing to settle", async () => {
    const { token, jar } = setup();
    addFine(getDb(), jar.id, null);
    const first = await settleUp(token, jar.id, { note: "holiday fund" });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ settlement: { total: 100, fineCount: 1, note: "holiday fund" }, balance: { total: 0, count: 0 } });
    const second = await settleUp(token, jar.id);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toEqual({ code: "nothing_to_settle", message: "Nothing to settle yet." });
  });
});
```

- [ ] **Step 2: Register the routes**

In `app/routes.ts`, after the routes from Task 9, add:

```ts
  route("api/v1/jars/:id/fines", "routes/api.v1.jars.$id.fines.ts"),
  route("api/v1/jars/:id/fines/:fineId", "routes/api.v1.jars.$id.fines.$fineId.ts"),
  route("api/v1/jars/:id/settlements", "routes/api.v1.jars.$id.settlements.ts"),
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/routes/api.v1.fines.test.ts`
Expected: FAIL, route modules not found.

- [ ] **Step 4: Implement**

Create `app/routes/api.v1.jars.$id.fines.ts`:

```ts
import type { Route } from "./+types/api.v1.jars.$id.fines";
import { api, apiJson, methodNotAllowed, optionalStringField, readJsonBody, requireDevice, requireJar, validationError } from "../lib/api.server";
import { fineJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { addClientFine, getBalance } from "../lib/jars.server";
import { parseNote } from "../lib/validation";

const CLIENT_ID = /^[A-Za-z0-9-]{1,64}$/;
const CLIENT_ID_MESSAGE = "Use 1 to 64 letters, digits or dashes.";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/jars/:id/fines { note?, clientId?, createdAt? }: 201 for a new fine, 200 for a replayed clientId. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const body = await readJsonBody(request);
  const note = parseNote(optionalStringField(body, "note"));
  const clientId = optionalStringField(body, "clientId");
  const createdAt = optionalStringField(body, "createdAt");
  const badClientId = clientId !== null && !CLIENT_ID.test(clientId);
  if (!note.ok || badClientId) {
    return validationError({
      ...(note.ok ? {} : { note: note.error }),
      ...(badClientId ? { clientId: CLIENT_ID_MESSAGE } : {}),
    });
  }
  const result = addClientFine(db, jar.id, { note: note.note, clientId, createdAt });
  if (!result) throw new Error(`jar ${jar.id} vanished while adding a fine`);
  return apiJson({ fine: fineJson(result.fine), balance: getBalance(db, jar.id) }, result.created ? 201 : 200);
});
```

Create `app/routes/api.v1.jars.$id.fines.$fineId.ts`:

```ts
import type { Route } from "./+types/api.v1.jars.$id.fines.$fineId";
import { api, apiError, apiJson, methodNotAllowed, requireDevice, requireJar } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { deleteFine, getBalance } from "../lib/jars.server";

export const loader = api(async () => methodNotAllowed(["DELETE"]));

/** DELETE /api/v1/jars/:id/fines/:fineId: undo or delete an unsettled fine. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const result = deleteFine(db, jar.id, params.fineId);
  if (result === "settled") return apiError(409, "already_settled", "That fine is already settled.");
  if (result === "missing") return apiError(404, "not_found", "That fine doesn't exist.");
  return apiJson({ balance: getBalance(db, jar.id) });
});
```

Create `app/routes/api.v1.jars.$id.settlements.ts`:

```ts
import type { Route } from "./+types/api.v1.jars.$id.settlements";
import { api, apiError, apiJson, methodNotAllowed, optionalStringField, readJsonBody, requireDevice, requireJar, validationError } from "../lib/api.server";
import { settlementJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { getBalance, settle } from "../lib/jars.server";
import { parseNote } from "../lib/validation";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/jars/:id/settlements { note? }: settle the unsettled balance. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const note = parseNote(optionalStringField(await readJsonBody(request), "note"));
  if (!note.ok) return validationError({ note: note.error });
  const settlement = settle(db, jar.id, note.note);
  if (!settlement) return apiError(409, "nothing_to_settle", "Nothing to settle yet.");
  return apiJson({ settlement: settlementJson(settlement), balance: getBalance(db, jar.id) }, 201);
});
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routes/api.v1.jars.\$id.fines.ts app/routes/api.v1.jars.\$id.fines.\$fineId.ts app/routes/api.v1.jars.\$id.settlements.ts app/routes/api.v1.fines.test.ts app/routes.ts
git commit -m "feat: fine and settlement API, safe to retry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sign-in returns to where it started

**Files:**
- Create: `app/components/SignInButtons.tsx`, `app/lib/http.server.test.ts`
- Modify: `app/lib/http.server.ts`, `app/lib/session.server.ts`, `app/routes/auth.$provider.tsx`, `app/routes/auth.$provider.callback.tsx`, `app/routes/home.tsx`
- Test: `app/lib/http.server.test.ts`, `app/routes/auth.test.ts`

**Interfaces:**
- Produces:
  - `safeReturnTo(raw: string | null | undefined): string`
  - `OAuthTransient.returnTo?: string`
  - `/auth/:provider?returnTo=<path>`
  - `<SignInButtons providers={{ google: boolean; github: boolean }} appUrl={string} returnTo?={string} />`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/http.server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./http.server";

describe("safeReturnTo", () => {
  it("keeps same-origin paths with their query", () => {
    for (const path of ["/jars", "/link?code=WDJB-MJHT", "/link/phone?code=WDJB-MJHT&provider=google", "/"]) expect(safeReturnTo(path)).toBe(path);
  });
  it("sends anything that could leave the site to /jars (Review Focus 4)", () => {
    for (const raw of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/ /evil.example", "https://evil.example/", "javascript:alert(1)", "jars", "", null, undefined, `/${"a".repeat(600)}`]) {
      expect(safeReturnTo(raw)).toBe("/jars");
    }
  });
});
```

In `app/routes/auth.test.ts`, append:

```ts
describe("auth: returning to where sign-in started", () => {
  const signInFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("access_token")) return json({ access_token: "tok" });
    return json({ id: 77, login: "rt", name: "Return Tripper", avatar_url: null, email: "rt@x.y" });
  };
  const callback = async (returnTo: string) => {
    vi.stubGlobal("fetch", signInFetch);
    const transient = (await serializeOAuthTransient({ provider: "github", state: "st", codeVerifier: "ver", returnTo })).split(";")[0];
    const response = (await callbackLoader(
      callArgs(getRequest("http://localhost:3000/auth/github/callback?code=c&state=st", transient), { provider: "github" }),
    )) as Response;
    return response.headers.get("Location");
  };

  it("stores a same-origin returnTo when sign-in starts, and drops anything else", async () => {
    const start = async (returnTo: string) => {
      const response = (await startLoader(
        callArgs(getRequest(`http://localhost:3000/auth/github?returnTo=${encodeURIComponent(returnTo)}`), { provider: "github" }),
      )) as Response;
      const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
      return (await parseOAuthTransient(getRequest("http://x/", cookie)))?.returnTo;
    };
    expect(await start("/link?code=WDJB-MJHT")).toBe("/link?code=WDJB-MJHT");
    expect(await start("https://evil.example/")).toBe("/jars");
  });
  it("lands on the stored returnTo after sign-in, checking it again", async () => {
    expect(await callback("/link?code=WDJB-MJHT")).toBe("/link?code=WDJB-MJHT");
    expect(await callback("//evil.example")).toBe("/jars");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/http.server.test.ts app/routes/auth.test.ts`
Expected: FAIL, `safeReturnTo` is not exported and `returnTo` is not stored.

- [ ] **Step 3: Implement `safeReturnTo`**

Append to `app/lib/http.server.ts`:

```ts
// A slash, then no second slash or backslash, and no whitespace or backslash anywhere: browsers strip tabs and
// newlines and read backslashes as slashes, which would turn "/\t/evil.example" into another host.
const RETURN_TO = /^\/(?![/\\])[^\s\\]*$/;

/** A same-origin path to land on after sign-in. Anything else is /jars. */
export function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.length <= 512 && RETURN_TO.test(raw) ? raw : "/jars";
}
```

- [ ] **Step 4: Carry `returnTo` through the OAuth cookie**

In `app/lib/session.server.ts`, change the interface and guard to:

```ts
export interface OAuthTransient {
  provider: Provider;
  state: string;
  codeVerifier: string;
  /** Same-origin path to land on after sign-in; checked again with safeReturnTo on the way out. */
  returnTo?: string;
}
```

```ts
function isTransient(value: unknown): value is OAuthTransient {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.provider === "google" || v.provider === "github") &&
    typeof v.state === "string" &&
    typeof v.codeVerifier === "string" &&
    (v.returnTo === undefined || typeof v.returnTo === "string")
  );
}
```

In `app/routes/auth.$provider.tsx`, import `safeReturnTo` alongside `notFound` (`import { notFound, safeReturnTo } from "../lib/http.server";`), change the loader signature to `export async function loader({ request, params }: Route.LoaderArgs) {`, and replace the `return redirect(…)` with:

```ts
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  return redirect(url.toString(), {
    headers: { "Set-Cookie": await serializeOAuthTransient({ provider, state, codeVerifier, returnTo }) },
  });
```

In `app/routes/auth.$provider.callback.tsx`, import it the same way (`import { notFound, safeReturnTo } from "../lib/http.server";`) and change
`const response = await createUserSession(user.id, "/jars");`
to
`const response = await createUserSession(user.id, safeReturnTo(transient.returnTo));`

- [ ] **Step 5: Extract the sign-in buttons**

Create `app/components/SignInButtons.tsx`:

```tsx
/** The landing's provider buttons and consent line. With returnTo, sign-in comes back to that path. */
export function SignInButtons({ providers, appUrl, returnTo }: { providers: { google: boolean; github: boolean }; appUrl: string; returnTo?: string }) {
  const none = !providers.google && !providers.github;
  const href = (provider: string) => (returnTo ? `/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}` : `/auth/${provider}`);
  return (
    <>
      {providers.google && <a href={href("google")} className="btn btn-ink raised">Continue with Google</a>}
      {providers.github && <a href={href("github")} className="btn btn-ghost raised">Continue with GitHub</a>}
      {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
      {!none && (
        <p className="max-w-[46ch] text-sm leading-snug">
          Signing in only tells Pay Up who you are: your name, email and picture, nothing else. By continuing you agree to the{" "}
          <a href={`${appUrl}/terms`} className="link">Terms of Service</a> and <a href={`${appUrl}/privacy`} className="link">Privacy Policy</a>.
        </p>
      )}
    </>
  );
}
```

In `app/routes/home.tsx`, add `import { SignInButtons } from "../components/SignInButtons";`, delete the line `const none = !providers.google && !providers.github;`, and replace these lines:

```tsx
          {providers.google && <a href="/auth/google" className="btn btn-ink raised">Continue with Google</a>}
          {providers.github && <a href="/auth/github" className="btn btn-ghost raised">Continue with GitHub</a>}
          {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
          {!none && (
            <p className="max-w-[46ch] text-sm leading-snug">
              Signing in only tells Pay Up who you are: your name, email and picture, nothing else. By continuing you agree to the{" "}
              <a href={`${appUrl}/terms`} className="link">Terms of Service</a> and <a href={`${appUrl}/privacy`} className="link">Privacy Policy</a>.
            </p>
          )}
```

with:

```tsx
          <SignInButtons providers={providers} appUrl={appUrl} />
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, including the existing "creates the user and session on success" test, which still lands on `/jars` because its transient has no `returnTo`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/http.server.ts app/lib/http.server.test.ts app/lib/session.server.ts app/routes/auth.\$provider.tsx app/routes/auth.\$provider.callback.tsx app/routes/auth.test.ts app/components/SignInButtons.tsx app/routes/home.tsx
git commit -m "feat: sign-in returns to the page it started from

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The /link pages

**Files:**
- Create: `app/lib/link-page.server.ts`, `app/components/LinkApproval.tsx`, `app/routes/link.tsx`, `app/routes/link.phone.tsx`
- Modify: `app/routes.ts`
- Test: `app/routes/link.test.ts`

**Interfaces:**
- Consumes: `findLink`, `approveLink`, `cancelLink`, `normalizeUserCode`, `formatUserCode` (Task 3); `SignInButtons` (Task 11); `getUser`, `requireUser`; `isProvider`; `env`.
- Produces:
  - `type LinkPageState = { state: "signin"; providers: { google: boolean; github: boolean }; appUrl: string; returnTo: string } | { state: "enter" } | { state: "confirm"; code: string; kind: DeviceKind; name: string } | { state: "expired" } | { state: "approved"; kind: DeviceKind }`
  - `linkPageLoader(request: Request, options: { autoProvider: boolean }): Promise<LinkPageState | Response>`
  - `linkPageAction(request: Request): Promise<LinkPageState | Response>`

- [ ] **Step 1: Write the failing tests**

Create `app/routes/link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { formatUserCode, pollLink, startLink } from "../lib/links.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader as phoneLoader } from "./link.phone";
import { action, loader } from "./link";

const ORIGIN = "http://localhost:3000";
function newLink(kind: "phone" | "watch" = "watch") {
  const link = startLink(getDb(), kind, kind === "watch" ? "Pixel Watch 3" : "Pixel 9");
  return { ...link, display: formatUserCode(link.userCode) };
}

describe("/link loader", () => {
  it("asks a signed-out visitor to sign in and come back", async () => {
    const link = newLink();
    const page = await loader(callArgs(getRequest(`${ORIGIN}/link?code=${link.display}`)));
    expect(page).toMatchObject({ state: "signin", returnTo: `/link?code=${link.display}`, providers: { google: true, github: true } });
  });
  it("asks for a code when there is none", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link`, cookie)))).toEqual({ state: "enter" });
  });
  it("shows which device is asking, whatever the code's case or spacing (Review Focus 3)", async () => {
    const link = newLink();
    const cookie = await sessionCookieFor(makeUser().id);
    const sloppy = encodeURIComponent(link.display.toLowerCase().replace("-", " "));
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=${sloppy}`, cookie)))).toEqual({
      state: "confirm",
      code: link.display,
      kind: "watch",
      name: "Pixel Watch 3",
    });
  });
  it("says an unknown or malformed code has expired", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=BBBB-BBBB`, cookie)))).toEqual({ state: "expired" });
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=hello`, cookie)))).toEqual({ state: "expired" });
  });
});

describe("/link/phone loader", () => {
  it("goes straight to the chosen provider and comes back here", async () => {
    const link = newLink("phone");
    const back = `/link/phone?code=${link.display}&provider=github`;
    const response = (await phoneLoader(callArgs(getRequest(`${ORIGIN}${back}`)))) as Response;
    expect(response.headers.get("Location")).toBe(`/auth/github?returnTo=${encodeURIComponent(back)}`);
  });
  it("shows the sign-in buttons for an unknown provider", async () => {
    expect(await phoneLoader(callArgs(getRequest(`${ORIGIN}/link/phone?code=BBBB-BBBB&provider=facebook`)))).toMatchObject({ state: "signin" });
  });
});

describe("/link action", () => {
  it("approves, so the device's next poll gets its token", async () => {
    const user = makeUser();
    const link = newLink();
    const page = await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, await sessionCookieFor(user.id))));
    expect(page).toEqual({ state: "approved", kind: "watch" });
    const result = pollLink(getDb(), link.deviceCode);
    expect(result.status === "approved" && result.user.id).toBe(user.id);
  });
  it("shows the approved page again after a double submit or a reload", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    const link = newLink();
    await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, cookie)));
    expect(await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, cookie)))).toEqual({ state: "approved", kind: "watch" });
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=${link.display}`, cookie)))).toEqual({ state: "approved", kind: "watch" });
  });
  it("cancels back to the jars, after which the device gets nothing", async () => {
    const link = newLink();
    const response = (await action(
      callArgs(formRequest(`${ORIGIN}/link`, { intent: "cancel", code: link.display }, await sessionCookieFor(makeUser().id))),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/jars");
    expect(pollLink(getDb(), link.deviceCode)).toEqual({ status: "expired" });
  });
  it("needs a session and a known intent", async () => {
    const signedOut = await catchResponse(action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: "BBBB-BBBB" }))));
    expect(signedOut.headers.get("Location")).toBe("/");
    const cookie = await sessionCookieFor(makeUser().id);
    const unknown = await catchResponse(action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "explode", code: newLink().display }, cookie))));
    expect(unknown.status).toBe(400);
  });
});
```

- [ ] **Step 2: Register the routes**

In `app/routes.ts`, after `route("account", "routes/account.tsx"),` add:

```ts
  route("link", "routes/link.tsx"),
  route("link/phone", "routes/link.phone.tsx"),
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/routes/link.test.ts`
Expected: FAIL, route modules not found.

- [ ] **Step 4: Implement the page logic**

Create `app/lib/link-page.server.ts`:

```ts
import { redirect } from "react-router";
import { getDb } from "./db.server";
import type { DeviceKind } from "./devices.server";
import { env } from "./env.server";
import { approveLink, cancelLink, findLink, formatUserCode, normalizeUserCode } from "./links.server";
import { isProvider } from "./oauth.server";
import { getUser, requireUser } from "./session.server";

export type LinkPageState =
  | { state: "signin"; providers: { google: boolean; github: boolean }; appUrl: string; returnTo: string }
  | { state: "enter" }
  | { state: "confirm"; code: string; kind: DeviceKind; name: string }
  | { state: "expired" }
  | { state: "approved"; kind: DeviceKind };

/** /link and /link/phone. With autoProvider, /link/phone?provider=google starts that sign-in straight away. */
export async function linkPageLoader(request: Request, options: { autoProvider: boolean }): Promise<LinkPageState | Response> {
  const url = new URL(request.url);
  const db = getDb();
  const e = env();
  const user = await getUser(request, db);
  if (!user) {
    const returnTo = `${url.pathname}${url.search}`;
    const provider = url.searchParams.get("provider");
    if (options.autoProvider && provider && isProvider(provider) && e[provider]) {
      return redirect(`/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return { state: "signin", providers: { google: Boolean(e.google), github: Boolean(e.github) }, appUrl: e.appUrl, returnTo };
  }
  const raw = url.searchParams.get("code");
  if (raw === null || raw.trim() === "") return { state: "enter" };
  const code = normalizeUserCode(raw);
  const link = code ? findLink(db, code) : null;
  if (!code || !link) return { state: "expired" };
  if (link.approved) return { state: "approved", kind: link.kind };
  return { state: "confirm", code: formatUserCode(code), kind: link.kind, name: link.name };
}

export async function linkPageAction(request: Request): Promise<LinkPageState | Response> {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent !== "approve" && intent !== "cancel") throw new Response("Unknown action.", { status: 400 });
  const code = normalizeUserCode(form.get("code"));
  if (!code) return { state: "expired" };
  if (intent === "cancel") {
    cancelLink(db, code, user.id);
    return redirect("/jars");
  }
  const link = findLink(db, code);
  if (!link) return { state: "expired" };
  if (!link.approved && !approveLink(db, code, user.id)) return { state: "expired" };
  return { state: "approved", kind: link.kind };
}
```

- [ ] **Step 5: Implement the component and routes**

Create `app/components/LinkApproval.tsx`:

```tsx
import { Form } from "react-router";
import type { LinkPageState } from "../lib/link-page.server";
import { SignInButtons } from "./SignInButtons";

export function LinkApproval({ page }: { page: LinkPageState }) {
  return <main className="flex flex-col gap-6">{content(page)}</main>;
}

function content(page: LinkPageState) {
  switch (page.state) {
    case "signin":
      return (
        <>
          <h1 className="display text-[46px]">Link a device</h1>
          <p className="font-semibold">Sign in, then confirm the code your phone or watch is showing.</p>
          <div className="flex flex-col gap-4">
            <SignInButtons providers={page.providers} appUrl={page.appUrl} returnTo={page.returnTo} />
          </div>
        </>
      );
    case "enter":
      return (
        <>
          <h1 className="display text-[46px]">Link a device</h1>
          <Form method="get" className="flex flex-col gap-3">
            <label htmlFor="code" className="font-semibold">Code on your device</label>
            <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="WDJB-MJHT" className="panel display tnum w-full px-3 py-3 text-3xl" />
            <button type="submit" className="btn btn-ink raised">Continue</button>
          </Form>
        </>
      );
    case "confirm":
      return (
        <>
          <h1 className="display text-[46px]">Link {page.name} to your Pay Up account?</h1>
          <p className="panel tilt self-start px-4 py-3">
            <span className="block text-sm font-semibold">Your {page.kind} should show</span>
            <b className="display tnum block text-[40px]">{page.code}</b>
          </p>
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="code" value={page.code} />
            <button type="submit" name="intent" value="approve" className="btn btn-pink raised-lg display text-[28px]">Link {page.kind}</button>
            <button type="submit" name="intent" value="cancel" className="btn btn-ghost raised">Cancel</button>
          </Form>
        </>
      );
    case "expired":
      return (
        <>
          <h1 className="display text-[46px]">That code has expired.</h1>
          <p className="font-semibold">Start again on your device.</p>
        </>
      );
    case "approved":
      return page.kind === "watch" ? (
        <>
          <h1 className="display text-[46px]">Linked.</h1>
          <p className="font-semibold">Your watch is ready.</p>
        </>
      ) : (
        <>
          <h1 className="display text-[46px]">Signed in.</h1>
          <a href="payup://linked" className="btn btn-pink raised-lg display text-[28px]">Return to Pay Up</a>
        </>
      );
  }
}
```

Create `app/routes/link.tsx`:

```tsx
import type { Route } from "./+types/link";
import { LinkApproval } from "../components/LinkApproval";
import { linkPageAction, linkPageLoader } from "../lib/link-page.server";

export function meta() {
  return [{ title: "Link a device" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return linkPageLoader(request, { autoProvider: false });
}

export function action({ request }: Route.ActionArgs) {
  return linkPageAction(request);
}

export default function LinkPage({ loaderData, actionData }: Route.ComponentProps) {
  return <LinkApproval page={actionData ?? loaderData} />;
}
```

Create `app/routes/link.phone.tsx`:

```tsx
import type { Route } from "./+types/link.phone";
import { LinkApproval } from "../components/LinkApproval";
import { linkPageAction, linkPageLoader } from "../lib/link-page.server";

export function meta() {
  return [{ title: "Sign in to Pay Up" }];
}

/** The phone app's own sign-in. A separate path from /link, so the app's App Link never captures it (spec 5.2). */
export function loader({ request }: Route.LoaderArgs) {
  return linkPageLoader(request, { autoProvider: true });
}

export function action({ request }: Route.ActionArgs) {
  return linkPageAction(request);
}

export default function PhoneLinkPage({ loaderData, actionData }: Route.ComponentProps) {
  return <LinkApproval page={actionData ?? loaderData} />;
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Look at the page**

Run `npm run dev` and open `http://localhost:5173/link?code=BBBB-BBBB` signed out: the sign-in state shows the two provider buttons and the consent line at 375px width with no sideways scroll. If `.env` has a provider configured and `APP_URL=http://localhost:5173` (see README), also sign in, start a link from a second terminal with
`curl -s -X POST http://localhost:5173/api/v1/links -H 'Content-Type: application/json' -d '{"kind":"watch","name":"Pixel Watch 3"}'`,
open the `verificationUrlComplete` it returns, and check the confirm, approved and expired states: the pink "Link watch" button is the loudest thing and the code sits in the tilted white panel. Without a provider, say so in your report so your human partner checks those states after deploying. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add app/lib/link-page.server.ts app/components/LinkApproval.tsx app/routes/link.tsx app/routes/link.phone.tsx app/routes/link.test.ts app/routes.ts
git commit -m "feat: /link pages to approve a phone or watch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The Devices page

**Files:**
- Create: `app/routes/devices.tsx`, `app/routes/devices.test.ts`
- Modify: `app/components/ConfirmButton.tsx`, `app/lib/copy.ts`, `app/routes/jars.tsx`, `app/routes.ts`
- Test: `app/routes/devices.test.ts`, `app/lib/copy.test.ts`

**Interfaces:**
- Consumes: `listDevices`, `revokeDevice` (Task 2); `formatDate`, `dayLabel`; `getTimeZone`, `getLocale`; `requireUser`; `notFound`.
- Produces: `lastUsedLabel(iso: string, now: Date, timeZone: string, locale: string): string`; `ConfirmButton` prop `fields?: Record<string, string>`; route `/devices`.

- [ ] **Step 1: Write the failing tests**

In `app/lib/copy.test.ts`, change the import to `import { dashboardSubtitle, fineCountLabel, lastUsedLabel } from "./copy";` and append:

```ts
describe("lastUsedLabel", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");
  it("says today and yesterday in lowercase, otherwise the date", () => {
    expect(lastUsedLabel("2026-10-10T08:00:00.000Z", now, "Europe/Madrid", "en-GB")).toBe("Last used today");
    expect(lastUsedLabel("2026-10-09T08:00:00.000Z", now, "Europe/Madrid", "en-GB")).toBe("Last used yesterday");
    expect(lastUsedLabel("2026-10-01T08:00:00.000Z", now, "Europe/Madrid", "en-GB")).toBe("Last used 1 October");
  });
});
```

Create `app/routes/devices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { authenticateDevice, createDevice } from "../lib/devices.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { action, loader } from "./devices";

const ORIGIN = "http://localhost:3000";

describe("/devices", () => {
  it("sends a visitor to the landing", async () => {
    const response = await catchResponse(loader(callArgs(getRequest(`${ORIGIN}/devices`))));
    expect(response.headers.get("Location")).toBe("/");
  });
  it("lists the user's devices with plain-language dates", async () => {
    const user = makeUser();
    createDevice(getDb(), user.id, "watch", "Pixel Watch 3");
    createDevice(getDb(), makeUser().id, "phone", "Not mine");
    const data = await loader(callArgs(getRequest(`${ORIGIN}/devices`, await sessionCookieFor(user.id), { "Accept-Language": "en-GB" })));
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0]).toMatchObject({ name: "Pixel Watch 3", kindLabel: "Watch", usedLabel: "Last used today" });
    expect(data.devices[0].addedLabel).toMatch(/^Added \d{1,2} [A-Z][a-z]+$/);
  });
  it("revokes one of the user's devices", async () => {
    const user = makeUser();
    const { device, token } = createDevice(getDb(), user.id, "watch", "W");
    const result = await action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "revoke", deviceId: device.id }, await sessionCookieFor(user.id))));
    expect(result).toEqual({ ok: true });
    expect(authenticateDevice(getDb(), token)).toBeNull();
  });
  it("404s someone else's device and rejects other intents", async () => {
    const { device } = createDevice(getDb(), makeUser().id, "watch", "W");
    const cookie = await sessionCookieFor(makeUser().id);
    expect((await catchResponse(action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "revoke", deviceId: device.id }, cookie))))).status).toBe(404);
    expect(await action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "explode" }, cookie)))).toMatchObject({ init: { status: 400 } });
  });
});
```

- [ ] **Step 2: Register the route**

In `app/routes.ts`, after the `/link` routes from Task 12, add `route("devices", "routes/devices.tsx"),`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run app/lib/copy.test.ts app/routes/devices.test.ts`
Expected: FAIL.

- [ ] **Step 4: Add `lastUsedLabel`**

In `app/lib/copy.ts`, add `import { dayLabel } from "./dates";` and append:

```ts
/** "Last used today", "Last used yesterday", "Last used 6 October". */
export function lastUsedLabel(iso: string, now: Date, timeZone: string, locale: string): string {
  const label = dayLabel(iso, now, timeZone, locale);
  return `Last used ${label === "Today" || label === "Yesterday" ? label.toLowerCase() : label}`;
}
```

- [ ] **Step 5: Let `ConfirmButton` post extra fields**

In `app/components/ConfirmButton.tsx`, add `fields` to the props:

```tsx
export function ConfirmButton({ intent, label, confirmLabel, message, className = "btn btn-ghost", action, fields = {} }: {
  intent: string;
  /** Route to post to; defaults to the current one. */
  action?: string;
  label: string;
  confirmLabel: string;
  message: string;
  className?: string;
  /** Hidden fields posted with the intent, such as the id of the thing being removed. */
  fields?: Record<string, string>;
}) {
```

and inside the `<Form>`, before the submit button, add:

```tsx
          {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
```

- [ ] **Step 6: Implement the page**

Create `app/routes/devices.tsx`:

```tsx
import { data, Link } from "react-router";
import type { Route } from "./+types/devices";
import { ConfirmButton } from "../components/ConfirmButton";
import { lastUsedLabel } from "../lib/copy";
import { formatDate } from "../lib/dates";
import { getDb } from "../lib/db.server";
import { listDevices, revokeDevice } from "../lib/devices.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { requireUser } from "../lib/session.server";
import { getLocale, getTimeZone } from "../lib/viewer.server";

export function meta() {
  return [{ title: "Devices" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const now = new Date();
  const timeZone = getTimeZone(request);
  const locale = getLocale(request, env().appLocale);
  return {
    devices: listDevices(db, user.id).map((d) => ({
      id: d.id,
      name: d.name,
      kindLabel: d.kind === "phone" ? "Phone" : "Watch",
      addedLabel: `Added ${formatDate(d.createdAt, now, timeZone, locale)}`,
      usedLabel: lastUsedLabel(d.lastUsedAt, now, timeZone, locale),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  if (form.get("intent") !== "revoke") return data({ ok: false as const, error: "Unknown action." }, { status: 400 });
  if (!revokeDevice(db, user.id, String(form.get("deviceId") ?? ""))) notFound();
  return { ok: true as const };
}

export default function Devices({ loaderData }: Route.ComponentProps) {
  const { devices } = loaderData;
  return (
    <main className="flex flex-col gap-6">
      <nav className="flex justify-between font-semibold"><Link to="/jars" className="link">‹ Jars</Link></nav>
      <h1 className="display text-[46px]">Devices</h1>
      {devices.length === 0 ? (
        <p className="font-semibold">No phones or watches yet. Get Pay Up on Google Play.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => (
            <li key={d.id} className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="display text-2xl">{d.name}</h2>
                <p className="text-sm font-semibold">{d.kindLabel}. {d.addedLabel}. {d.usedLabel}.</p>
              </div>
              <ConfirmButton intent="revoke" fields={{ deviceId: d.id }} label="Revoke" confirmLabel="Revoke" message={`Revoke ${d.name}? It will be signed out.`} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Link it from the dashboard**

In `app/routes/jars.tsx`, replace

```tsx
      <nav className="flex justify-end">
        <Form method="post" action="/logout"><button type="submit" className="link">Sign out</button></Form>
      </nav>
```

with

```tsx
      <nav className="flex items-center justify-end gap-5">
        <Link to="/devices" className="link">Devices</Link>
        <Form method="post" action="/logout"><button type="submit" className="link">Sign out</button></Form>
      </nav>
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/routes/devices.tsx app/routes/devices.test.ts app/components/ConfirmButton.tsx app/lib/copy.ts app/lib/copy.test.ts app/routes/jars.tsx app/routes.ts
git commit -m "feat: Devices page to see and revoke phones and watches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Account deletion page and the privacy update

**Files:**
- Create: `app/routes/delete-account.tsx`
- Modify: `app/routes/privacy.tsx`, `app/routes.ts`
- Test: `app/routes/legal.test.ts`

**Interfaces:**
- Consumes: `LegalPage`, `Section`; `SignInButtons` (Task 11); `getUser`; `env`.
- Produces: route `/delete-account` (public) for Play's Data safety form.

- [ ] **Step 1: Write the failing test**

In `app/routes/legal.test.ts`, change the helpers import to `import { callArgs, getRequest, makeUser, sessionCookieFor } from "../test/helpers";`, add `import { loader as deleteLoader, meta as deleteMeta } from "./delete-account";`, and append:

```ts
describe("/delete-account", () => {
  it("is public, names the operator and says whether the visitor is signed in", async () => {
    const visitor = await deleteLoader(callArgs(getRequest("http://localhost:3000/delete-account")));
    expect(visitor).toMatchObject({ signedIn: false, providers: { google: true, github: true }, operatorName: "[operator name not set]", appUrl: "http://localhost:3000" });
    expect(visitor.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await deleteLoader(callArgs(getRequest("http://localhost:3000/delete-account", cookie)))).toMatchObject({ signedIn: true });
    expect(deleteMeta()).toContainEqual({ title: "Delete your account" });
  });
});
```

- [ ] **Step 2: Register the route**

In `app/routes.ts`, after `route("privacy", "routes/privacy.tsx"),` add `route("delete-account", "routes/delete-account.tsx"),`.

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run app/routes/legal.test.ts`
Expected: FAIL, route module not found.

- [ ] **Step 4: Implement the page**

Create `app/routes/delete-account.tsx`. Set `UPDATED` to the date you make this change, in `YYYY-MM-DD`; the code shows 2026-10-10.

```tsx
import { Link } from "react-router";
import type { Route } from "./+types/delete-account";
import { LegalPage, Section } from "../components/LegalPage";
import { SignInButtons } from "../components/SignInButtons";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { getUser } from "../lib/session.server";

const UPDATED = "2026-10-10";

export function meta() {
  return [{ title: "Delete your account" }];
}

/** Public: Google Play's Data safety form links here so people can delete without reinstalling the app. */
export async function loader({ request }: Route.LoaderArgs) {
  const e = env();
  const user = await getUser(request, getDb());
  return {
    operatorName: e.operatorName,
    contactEmail: e.contactEmail,
    appUrl: e.appUrl,
    updated: UPDATED,
    signedIn: Boolean(user),
    providers: { google: Boolean(e.google), github: Boolean(e.github) },
  };
}

export default function DeleteAccount({ loaderData }: Route.ComponentProps) {
  const { signedIn, providers, appUrl } = loaderData;
  return (
    <LegalPage title="Delete your account" data={loaderData}>
      <Section title="What goes">
        <p>Your account and everything in it: every jar, fine and settle-up, and every phone and watch signed in to it. Public links stop working. It happens straight away and there is no undo.</p>
      </Section>
      {signedIn ? (
        <Section title="Delete it">
          <p>Open your jars, scroll to Account and choose Delete my account. The phone app has the same button under Account.</p>
          <Link to="/jars" className="btn btn-ink raised self-start">Open your jars</Link>
        </Section>
      ) : (
        <Section title="Sign in to delete">
          <p>Sign in with the account you want gone. You land on your jars; scroll to Account and choose Delete my account.</p>
          <div className="flex flex-col gap-4">
            <SignInButtons providers={providers} appUrl={appUrl} returnTo="/jars" />
          </div>
        </Section>
      )}
      <Section title="Can't sign in?">
        <p>Write to the contact address above from the email on your account, and the operator will delete it for you.</p>
      </Section>
    </LegalPage>
  );
}
```

- [ ] **Step 5: Update the privacy policy**

In `app/routes/privacy.tsx`:

1. Set `UPDATED` to the date you make this change.
2. After the `<Section title="5. Public jars">…</Section>` block, insert:

```tsx
      <Section title="6. Phone and watch apps">
        <p>The Pay Up apps for Android phones and Wear OS watches use the same account and the same data as this site. When you sign a phone or watch in, it gets its own key. We store a fingerprint of that key, never the key itself, with the device's name (for example "Pixel Watch 3"), whether it is a phone or a watch, when it was added and when it was last used.</p>
        <p>The device keeps its key, a copy of your jars and any fines you tapped while offline until they reach the server. You can see and revoke your devices on the <Link to="/devices" className="link">Devices</Link> page or in the phone app, and signing out on a device revokes it too. The apps contain no analytics, advertising or tracking SDKs.</p>
      </Section>
```

3. Renumber the sections after it: `"6. How long we keep it"` becomes `"7. How long we keep it"`, `"7. Your rights"` becomes `"8. Your rights"`, `"8. Where it lives, and security"` becomes `"9. Where it lives, and security"`, `"9. Children and changes"` becomes `"10. Children and changes"`.
4. In "How long we keep it", change `erases the account, its jars, fines and settlements immediately.` to `erases the account, its jars, fines, settlements and devices immediately.`
5. In "Your rights", replace `and you can delete your account yourself from the dashboard.` with:

```tsx
and you can delete your account yourself from the dashboard, from the phone app, or by following <Link to="/delete-account" className="link">these steps</Link>.
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/routes/delete-account.tsx app/routes/privacy.tsx app/routes/legal.test.ts app/routes.ts
git commit -m "feat: public account deletion page; privacy policy covers the apps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Asset Links

**Files:**
- Create: `app/lib/assetlinks.server.ts`, `app/routes/assetlinks.ts`, `app/lib/assetlinks.server.test.ts`
- Modify: `app/lib/env.server.ts`, `app/routes.ts`, `.env.example`, `README.md`
- Test: `app/lib/env.server.test.ts`, `app/lib/assetlinks.server.test.ts`

**Interfaces:**
- Produces: `Env.androidCertFingerprints: string[]`; `ANDROID_PACKAGE = "com.arslansb.payup"`; `assetLinks(fingerprints: string[]): Response`; route `/.well-known/assetlinks.json`.

- [ ] **Step 1: Write the failing tests**

In `app/lib/env.server.test.ts`, append:

```ts
describe("readEnv: Android App Links", () => {
  const fp = Array.from({ length: 32 }, () => "ab").join(":");
  it("defaults to no fingerprints", () => {
    expect(readEnv(base).androidCertFingerprints).toEqual([]);
  });
  it("reads comma-separated fingerprints, uppercased", () => {
    expect(readEnv({ ...base, ANDROID_CERT_FINGERPRINTS: ` ${fp} , ${fp.toUpperCase()} ` }).androidCertFingerprints).toEqual([fp.toUpperCase(), fp.toUpperCase()]);
  });
  it("refuses anything that is not a SHA-256 fingerprint", () => {
    expect(() => readEnv({ ...base, ANDROID_CERT_FINGERPRINTS: "AB:CD" })).toThrow(/ANDROID_CERT_FINGERPRINTS/);
  });
});
```

Create `app/lib/assetlinks.server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assetLinks } from "./assetlinks.server";

const FP = Array.from({ length: 32 }, () => "AB").join(":");

describe("assetLinks", () => {
  it("lets com.arslansb.payup handle this site's links", async () => {
    const response = assetLinks([FP]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.arslansb.payup", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });
  it("404s until fingerprints are configured", () => {
    expect(assetLinks([]).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/lib/env.server.test.ts app/lib/assetlinks.server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Read the fingerprints**

In `app/lib/env.server.ts`, add to the `Env` interface:

```ts
  /** SHA-256 fingerprints of the Android app's signing certificates, for App Links. */
  androidCertFingerprints: string[];
```

above `readEnv`, add:

```ts
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function fingerprints(raw: string | undefined): string[] {
  const list = (raw ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const fp of list) {
    if (!FINGERPRINT.test(fp)) throw new Error("ANDROID_CERT_FINGERPRINTS must be SHA-256 fingerprints like AB:CD:…, separated by commas");
  }
  return list;
}
```

and add to the returned object in `readEnv`:

```ts
    androidCertFingerprints: fingerprints(source.ANDROID_CERT_FINGERPRINTS),
```

- [ ] **Step 4: Implement the response and the route**

Create `app/lib/assetlinks.server.ts`:

```ts
export const ANDROID_PACKAGE = "com.arslansb.payup";

/** Digital Asset Links: lets the Android app open payup links such as a watch's /link (spec 5.5). 404 until configured. */
export function assetLinks(fingerprints: string[]): Response {
  if (fingerprints.length === 0) return new Response("Not found", { status: 404 });
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
```

Create `app/routes/assetlinks.ts`:

```ts
import { assetLinks } from "../lib/assetlinks.server";
import { env } from "../lib/env.server";

// A route rather than a static file: express.static ignores dot-folders such as .well-known.
export function loader() {
  return assetLinks(env().androidCertFingerprints);
}
```

In `app/routes.ts`, after the `delete-account` route, add `route(".well-known/assetlinks.json", "routes/assetlinks.ts"),`.

- [ ] **Step 5: Document the variable**

In `.env.example`, after the `CONTACT_EMAIL=` line, add:

```
# SHA-256 fingerprints of the Android app's signing certificates, comma-separated. Enables App Links.
ANDROID_CERT_FINGERPRINTS=
```

In `README.md`, add this row to the Configuration table, after the `OPERATOR_NAME` / `CONTACT_EMAIL` row:

```
| `ANDROID_CERT_FINGERPRINTS` | for the Android apps' App Links | empty. Comma-separated SHA-256 fingerprints of the app's signing certificates (the debug certificate in development, the Play App Signing one in production), served at `/.well-known/assetlinks.json` |
```

and add this section after the Docker section:

```
## Phone and watch apps

The Android phone and Wear OS apps talk to the JSON API at `/api/v1` with a token per device. A device signs in by showing a code that you approve at `/link` (or in the phone app). See `docs/superpowers/specs/2026-10-10-native-apps-design.md`. Signed-in users see and revoke devices at `/devices`.
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/lib/assetlinks.server.ts app/lib/assetlinks.server.test.ts app/routes/assetlinks.ts app/lib/env.server.ts app/lib/env.server.test.ts app/routes.ts .env.example README.md
git commit -m "feat: assetlinks.json for the Android app's App Links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End-to-end check and version

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Full test, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 2: Walk the whole flow through the real server**

This runs the built server and a watch's full sign-in, with no `Origin` headers, as the apps will send. Seeding a user and a phone straight into SQLite stands in for an OAuth sign-in.

```bash
WORK=$(mktemp -d)
FP=$(printf 'AB:%.0s' {1..31})AB
SESSION_SECRET=verify-secret-long-enough-123 APP_URL=http://localhost:3999 PORT=3999 DATABASE_PATH="$WORK/payup.db" \
  ANDROID_CERT_FINGERPRINTS="$FP" NODE_ENV=production node server.js > "$WORK/server.log" 2>&1 &
echo $! > "$WORK/pid"
B=http://localhost:3999
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[process.argv[1]]))' "$1"; }
curl -s --retry 20 --retry-connrefused --retry-delay 1 "$B/healthz"; echo

LINK=$(curl -s -X POST "$B/api/v1/links" -H 'Content-Type: application/json' -d '{"kind":"watch","name":"Verify watch"}')
echo "start: $LINK"
DEVICE_CODE=$(echo "$LINK" | json deviceCode); USER_CODE=$(echo "$LINK" | json userCode)

PHONE=pu_verifyverifyverifyverifyverifyverifyverif
HASH=$(printf %s "$PHONE" | shasum -a 256 | cut -d' ' -f1)
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
sqlite3 "$WORK/payup.db" "INSERT INTO users (id, provider, provider_id, name, created_at) VALUES ('verifyuser000001','github','verify','Verifier','$NOW');
  INSERT INTO devices (id, user_id, kind, name, token_hash, created_at, last_used_at) VALUES ('verifydevice0001','verifyuser000001','phone','Verify phone','$HASH','$NOW','$NOW');"

echo "approve: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/v1/links/$USER_CODE/approve" -H "Authorization: Bearer $PHONE")"
ISSUED=$(curl -s -X POST "$B/api/v1/links/token" -H 'Content-Type: application/json' -d "{\"deviceCode\":\"$DEVICE_CODE\"}")
echo "token: $ISSUED"
WATCH=$(echo "$ISSUED" | json token)
H=(-H "Authorization: Bearer $WATCH" -H 'Content-Type: application/json')

JAR=$(curl -s -X POST "$B/api/v1/jars" "${H[@]}" -d '{"title":"Verify jar","fineAmount":100,"currency":"EUR","visibility":"private"}')
echo "create: $JAR"; JAR_ID=$(echo "$JAR" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).jar.id))')
echo "put: $(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/v1/jars/$JAR_ID" "${H[@]}" -d '{"title":"Verify jar","fineAmount":150,"currency":"EUR","visibility":"public"}')"
echo "fine: $(curl -s -w ' %{http_code}' -X POST "$B/api/v1/jars/$JAR_ID/fines" "${H[@]}" -d '{"clientId":"e2e-tap-1"}')"
echo "replay: $(curl -s -w ' %{http_code}' -X POST "$B/api/v1/jars/$JAR_ID/fines" "${H[@]}" -d '{"clientId":"e2e-tap-1"}')"
echo "settle: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/v1/jars/$JAR_ID/settlements" "${H[@]}" -d '{}')"
echo "sign out: $(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$B/api/v1/devices/current" -H "Authorization: Bearer $WATCH")"
echo "after sign out: $(curl -s -o /dev/null -w '%{http_code}' "$B/api/v1/me" -H "Authorization: Bearer $WATCH")"
echo "assetlinks: $(curl -s -w ' %{http_code}' "$B/.well-known/assetlinks.json")"
echo "privacy mentions apps: $(curl -s "$B/privacy" | grep -c 'Phone and watch apps')"
echo "delete-account: $(curl -s -o /dev/null -w '%{http_code}' "$B/delete-account")"
kill "$(cat "$WORK/pid")"
```

Expected:
- `start:` JSON with `deviceCode`, `userCode` like `WDJB-MJHT`, `verificationUrlComplete` ending in `/link?code=…`
- `approve: 204`
- `token:` JSON with `token` starting `pu_`, `device.kind` `watch`
- `create:` JSON with `jar.title` `Verify jar`
- `put: 200`
- `fine:` JSON with `amount` 150 and ` 201`
- `replay:` the same fine id and ` 200`
- `settle: 201`
- `sign out: 204`, then `after sign out: 401`
- `assetlinks:` the JSON statement with `com.arslansb.payup` and ` 200`
- `privacy mentions apps: 1`
- `delete-account: 200`

Any other result is a bug to fix before continuing; the server log is in `$WORK/server.log`.

- [ ] **Step 3: Check the spec amendments landed**

Run: `grep -n "addClientFine\|x-payup-client-ip\|network jitter" docs/superpowers/specs/2026-10-10-native-apps-design.md`
Expected: three matches, from Tasks 3, 4 and 7.

- [ ] **Step 4: Bump the version**

Run: `npm version 0.2.0 --no-git-tag-version`
Expected: `package.json` and `package-lock.json` say `0.2.0`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: API v1 for the phone and watch apps, device linking, devices page; version 0.2.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deploying is the operator's decision and is not part of this plan. After deploying, set `ANDROID_CERT_FINGERPRINTS` once the Android debug or Play signing certificate exists (plan 2).
