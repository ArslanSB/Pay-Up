import { describe, expect, it } from "vitest";
import {
  authorizationUrl,
  codeChallenge,
  exchangeCode,
  fetchProfile,
  generateCodeVerifier,
  generateState,
  isProvider,
  OAuthError,
  redirectUri,
  safeEqual,
} from "./oauth.server";

const creds = { clientId: "cid", clientSecret: "sec" };
const cb = "http://localhost:3000/auth/google/callback";

type Call = { url: string; init?: RequestInit };
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("helpers", () => {
  it("isProvider", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("github")).toBe(true);
    expect(isProvider("facebook")).toBe(false);
  });
  it("state and verifier are base64url and 43 chars", () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateState()).not.toBe(generateState());
  });
  it("codeChallenge is the S256 of the verifier", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("redirectUri", () => {
    expect(redirectUri("http://localhost:3000", "github")).toBe("http://localhost:3000/auth/github/callback");
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("authorizationUrl", () => {
  it("google carries state, PKCE challenge and openid scopes", () => {
    const url = authorizationUrl("google", creds, { redirectUri: cb, state: "st", codeVerifier: "ver" });
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(cb);
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge("ver"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });
  it("github carries state and email scope, no PKCE", () => {
    const url = authorizationUrl("github", creds, { redirectUri: cb, state: "st", codeVerifier: "ver" });
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });
});

describe("exchangeCode", () => {
  it("google posts the verifier and returns the access token", async () => {
    const { impl, calls } = fakeFetch(() => json({ access_token: "tok", expires_in: 3600 }));
    const token = await exchangeCode("google", creds, { redirectUri: cb, code: "c0de", codeVerifier: "ver" }, impl);
    expect(token).toBe("tok");
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("code_verifier")).toBe("ver");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("sec");
  });
  it("google non-200 throws OAuthError with the provider code", async () => {
    const { impl } = fakeFetch(() => json({ error: "invalid_grant" }, 400));
    await expect(exchangeCode("google", creds, { redirectUri: cb, code: "x", codeVerifier: "v" }, impl)).rejects.toMatchObject({
      name: "OAuthError",
      code: "invalid_grant",
    });
  });
  it("github 200 with an error field throws (Review Focus 2)", async () => {
    const { impl } = fakeFetch(() => json({ error: "bad_verification_code" }, 200));
    await expect(exchangeCode("github", creds, { redirectUri: cb, code: "x", codeVerifier: "v" }, impl)).rejects.toBeInstanceOf(OAuthError);
  });
  it("github sends Accept: application/json", async () => {
    const { impl, calls } = fakeFetch(() => json({ access_token: "gh" }));
    await exchangeCode("github", creds, { redirectUri: cb, code: "x", codeVerifier: "v" }, impl);
    expect(new Headers(calls[0].init?.headers).get("Accept")).toBe("application/json");
  });
  it("network failure becomes OAuthError", async () => {
    const impl = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(exchangeCode("google", creds, { redirectUri: cb, code: "x", codeVerifier: "v" }, impl)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("fetchProfile", () => {
  it("google maps sub/name/picture and trusts only verified emails", async () => {
    const { impl } = fakeFetch(() => json({ sub: "123", name: "Ada", picture: "https://p/a.png", email: "a@b.c", email_verified: true }));
    expect(await fetchProfile("google", "tok", impl)).toEqual({ providerId: "123", name: "Ada", avatarUrl: "https://p/a.png", email: "a@b.c" });
    const unverified = fakeFetch(() => json({ sub: "123", email: "a@b.c", email_verified: false }));
    expect(await fetchProfile("google", "tok", unverified.impl)).toMatchObject({ email: null, name: "Someone" });
  });
  it("github falls back to the emails endpoint when email is hidden", async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.endsWith("/user")
        ? json({ id: 7, login: "ada", name: null, avatar_url: "https://g/a.png", email: null })
        : json([
            { email: "old@x.y", primary: false, verified: true },
            { email: "ada@x.y", primary: true, verified: true },
          ]),
    );
    expect(await fetchProfile("github", "tok", impl)).toEqual({ providerId: "7", name: "ada", avatarUrl: "https://g/a.png", email: "ada@x.y" });
    expect(calls.map((c) => c.url)).toEqual(["https://api.github.com/user", "https://api.github.com/user/emails"]);
    expect(new Headers(calls[0].init?.headers).get("User-Agent")).toBe("pay-up");
  });
  it("github with a public email does not call the emails endpoint", async () => {
    const { impl, calls } = fakeFetch(() => json({ id: 7, login: "ada", name: "Ada L", avatar_url: null, email: "ada@x.y" }));
    expect(await fetchProfile("github", "tok", impl)).toMatchObject({ name: "Ada L", email: "ada@x.y" });
    expect(calls).toHaveLength(1);
  });
  it("non-200 profile throws OAuthError", async () => {
    const { impl } = fakeFetch(() => json({ message: "bad token" }, 401));
    await expect(fetchProfile("github", "tok", impl)).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("fetchProfile: malformed provider responses (final review, Important 1)", () => {
  it("non-JSON 200 profile body throws OAuthError instead of a raw parse error", async () => {
    const { impl } = fakeFetch(() => new Response("<html>maintenance</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(fetchProfile("github", "tok", impl)).rejects.toBeInstanceOf(OAuthError);
  });
  it("non-array emails response yields a null email, not a crash", async () => {
    const { impl } = fakeFetch((url) =>
      url.endsWith("/user") ? json({ id: 7, login: "ada", name: null, avatar_url: null, email: null }) : json({ message: "rate limited" }),
    );
    expect(await fetchProfile("github", "tok", impl)).toMatchObject({ providerId: "7", email: null, name: "ada" });
  });
});
