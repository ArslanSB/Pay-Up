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

const BODY_TOO_LARGE = "Request body is too large.";

/** The request body as text, read in chunks so a body over the cap is refused without being buffered whole. */
async function readCappedText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw apiError(400, "invalid_request", BODY_TOO_LARGE);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw apiError(400, "invalid_request", BODY_TOO_LARGE);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await readCappedText(request);
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
