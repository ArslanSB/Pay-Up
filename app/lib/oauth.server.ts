import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Credentials } from "./env.server";
import type { Provider } from "./users.server";

export const PROVIDERS: Provider[] = ["google", "github"];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

export interface Profile {
  providerId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}

export class OAuthError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function redirectUri(appUrl: string, provider: Provider): string {
  return `${appUrl}/auth/${provider}/callback`;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const ENDPOINTS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    profile: "https://api.github.com/user",
    scope: "read:user user:email",
  },
} as const;

export function authorizationUrl(
  provider: Provider,
  creds: Credentials,
  params: { redirectUri: string; state: string; codeVerifier: string },
): URL {
  const url = new URL(ENDPOINTS[provider].authorize);
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", ENDPOINTS[provider].scope);
  if (provider === "google") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", codeChallenge(params.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function exchangeCode(
  provider: Provider,
  creds: Credentials,
  params: { redirectUri: string; code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  if (provider === "google") body.set("code_verifier", params.codeVerifier);
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINTS[provider].token, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    throw new OAuthError(`Token request failed: ${String(error)}`, "network");
  }
  const json = await readJson(response);
  // GitHub answers 200 with an `error` field on failure, so check both.
  if (response.status !== 200 || typeof json.error === "string") {
    const code = typeof json.error === "string" ? json.error : `http_${response.status}`;
    throw new OAuthError(`Token exchange failed: ${code}`, code);
  }
  if (typeof json.access_token !== "string") throw new OAuthError("Token response had no access_token", "no_token");
  return json.access_token;
}

async function getJson(url: string, accessToken: string, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": "pay-up" },
    });
  } catch (error) {
    throw new OAuthError(`Profile request failed: ${String(error)}`, "network");
  }
  if (response.status !== 200) throw new OAuthError(`Profile request failed: ${response.status}`, `http_${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new OAuthError("Profile response was not JSON", "invalid_json");
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export async function fetchProfile(provider: Provider, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<Profile> {
  const raw = (await getJson(ENDPOINTS[provider].profile, accessToken, fetchImpl)) as Record<string, unknown>;
  if (provider === "google") {
    const sub = str(raw.sub);
    if (!sub) throw new OAuthError("Google profile had no sub", "no_sub");
    const email = raw.email_verified === true ? str(raw.email) : null;
    return { providerId: sub, email, name: str(raw.name) ?? email ?? "Someone", avatarUrl: str(raw.picture) };
  }
  const id = typeof raw.id === "number" ? String(raw.id) : str(raw.id);
  if (!id) throw new OAuthError("GitHub profile had no id", "no_id");
  let email = str(raw.email);
  if (!email) {
    const raw = await getJson("https://api.github.com/user/emails", accessToken, fetchImpl);
    const emails = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
    const verified = emails.filter((e) => e.verified === true);
    email = str(verified.find((e) => e.primary === true)?.email) ?? str(verified[0]?.email);
  }
  return { providerId: id, email, name: str(raw.name) ?? str(raw.login) ?? "Someone", avatarUrl: str(raw.avatar_url) };
}
