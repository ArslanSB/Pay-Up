import { getDb, type Db } from "../lib/db.server";
import { createDevice, type DeviceKind } from "../lib/devices.server";
import { createUserSession } from "../lib/session.server";
import { upsertUser, type User } from "../lib/users.server";

let counter = 0;

export function makeUser(db: Db = getDb(), name = "Tester"): User {
  counter += 1;
  return upsertUser(db, { provider: "github", providerId: `test-${Date.now()}-${counter}`, email: null, name, avatarUrl: null });
}

export async function sessionCookieFor(userId: string): Promise<string> {
  const response = await createUserSession(userId, "/");
  const header = response.headers.get("Set-Cookie");
  if (!header) throw new Error("no session cookie");
  return header.split(";")[0];
}

export function formRequest(url: string, fields: Record<string, string>, cookie?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (cookie) headers.Cookie = cookie;
  return new Request(url, { method: "POST", headers, body: new URLSearchParams(fields) });
}

export function getRequest(url: string, cookie?: string, extra: Record<string, string> = {}): Request {
  return new Request(url, { headers: cookie ? { Cookie: cookie, ...extra } : extra });
}

/** Loader/action args. Route modules in this app never read `context`, so a stub is enough. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callArgs(request: Request, params: Record<string, string> = {}): any {
  return { request, params, context: {} };
}

export async function catchResponse(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown Response");
}

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
