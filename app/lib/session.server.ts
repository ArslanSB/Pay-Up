import { createCookie, createCookieSessionStorage, redirect } from "react-router";
import type { Db } from "./db.server";
import { env } from "./env.server";
import { findUserById, type Provider, type User } from "./users.server";

type SessionData = { userId: string };

function cookieOptions() {
  const e = env();
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secrets: [e.sessionSecret], secure: e.isProduction };
}

let storage: ReturnType<typeof createCookieSessionStorage<SessionData>> | null = null;
function sessionStorage() {
  storage ??= createCookieSessionStorage<SessionData>({
    cookie: { name: "__session", maxAge: 60 * 60 * 24 * 30, ...cookieOptions() },
  });
  return storage;
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await sessionStorage().getSession(request.headers.get("Cookie"));
  return session.get("userId") ?? null;
}

export async function getUser(request: Request, db: Db): Promise<User | null> {
  const userId = await getUserId(request);
  return userId ? findUserById(db, userId) : null;
}

export async function requireUser(request: Request, db: Db): Promise<User> {
  const user = await getUser(request, db);
  if (!user) throw redirect("/");
  return user;
}

export async function createUserSession(userId: string, redirectTo: string): Promise<Response> {
  const session = await sessionStorage().getSession();
  session.set("userId", userId);
  return redirect(redirectTo, { headers: { "Set-Cookie": await sessionStorage().commitSession(session) } });
}

export async function destroyUserSession(request: Request, redirectTo: string): Promise<Response> {
  const session = await sessionStorage().getSession(request.headers.get("Cookie"));
  return redirect(redirectTo, { headers: { "Set-Cookie": await sessionStorage().destroySession(session) } });
}

export interface OAuthTransient {
  provider: Provider;
  state: string;
  codeVerifier: string;
  /** Same-origin path to land on after sign-in; checked again with safeReturnTo on the way out. */
  returnTo?: string;
}

let transientCookie: ReturnType<typeof createCookie> | null = null;
function oauthCookie() {
  transientCookie ??= createCookie("__oauth", { maxAge: 600, ...cookieOptions() });
  return transientCookie;
}

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

export async function serializeOAuthTransient(transient: OAuthTransient): Promise<string> {
  return oauthCookie().serialize(transient);
}

export async function parseOAuthTransient(request: Request): Promise<OAuthTransient | null> {
  const value: unknown = await oauthCookie().parse(request.headers.get("Cookie"));
  return isTransient(value) ? value : null;
}

export async function clearOAuthTransient(): Promise<string> {
  return oauthCookie().serialize("", { maxAge: 0 });
}
