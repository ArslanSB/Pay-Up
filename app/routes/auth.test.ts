import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../lib/db.server";
import { parseOAuthTransient, serializeOAuthTransient } from "../lib/session.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader as startLoader } from "./auth.$provider";
import { loader as callbackLoader } from "./auth.$provider.callback";
import { loader as homeLoader } from "./home";
import { action as logoutAction, loader as logoutLoader } from "./logout";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("home loader", () => {
  it("lists configured providers for a visitor and flags a sign-in error", async () => {
    const data = await homeLoader(callArgs(getRequest("http://localhost:3000/?error=signin")));
    expect(data).toEqual({ providers: { google: true, github: true }, signInError: true, deleted: false });
  });
  it("redirects a signed-in user to /jars", async () => {
    const user = makeUser();
    const response = await homeLoader(callArgs(getRequest("http://localhost:3000/", await sessionCookieFor(user.id))));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/jars");
  });
});

describe("auth start", () => {
  it("404s on an unknown provider", async () => {
    const response = await catchResponse(startLoader(callArgs(getRequest("http://localhost:3000/auth/facebook"), { provider: "facebook" })));
    expect(response.status).toBe(404);
  });
  it("redirects to the provider and stores state and verifier in the transient cookie", async () => {
    const response = (await startLoader(callArgs(getRequest("http://localhost:3000/auth/google"), { provider: "google" }))) as Response;
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.hostname).toBe("accounts.google.com");
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    const transient = await parseOAuthTransient(getRequest("http://x/", cookie));
    expect(transient?.provider).toBe("google");
    expect(location.searchParams.get("state")).toBe(transient?.state);
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/google/callback");
  });
});

describe("auth callback", () => {
  const transientCookie = async (provider: "google" | "github", state = "st", codeVerifier = "ver") =>
    (await serializeOAuthTransient({ provider, state, codeVerifier })).split(";")[0];

  it("fails cleanly on a state mismatch", async () => {
    const response = (await callbackLoader(
      callArgs(getRequest("http://localhost:3000/auth/github/callback?code=c&state=WRONG", await transientCookie("github")), { provider: "github" }),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/?error=signin");
    expect(response.headers.get("Set-Cookie")).toMatch(/__oauth=/);
  });
  it("fails cleanly when the provider rejects the code", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "bad_verification_code" }));
    const response = (await callbackLoader(
      callArgs(getRequest("http://localhost:3000/auth/github/callback?code=c&state=st", await transientCookie("github")), { provider: "github" }),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/?error=signin");
  });
  it("creates the user and session on success", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("access_token")) return json({ access_token: "tok" });
      return json({ id: 99, login: "ada", name: "Ada", avatar_url: null, email: "ada@x.y" });
    });
    const response = (await callbackLoader(
      callArgs(getRequest("http://localhost:3000/auth/github/callback?code=c&state=st", await transientCookie("github")), { provider: "github" }),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/jars");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__session="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("__oauth=") && /Max-Age=0|Expires=/.test(c))).toBe(true);
    const user = getDb().prepare("SELECT name FROM users WHERE provider = 'github' AND provider_id = '99'").pluck().get();
    expect(user).toBe("Ada");
  });
});

describe("logout", () => {
  it("GET redirects home, POST clears the session", async () => {
    expect((logoutLoader() as Response).headers.get("Location")).toBe("/");
    const user = makeUser();
    const response = await logoutAction(callArgs(formRequest("http://localhost:3000/logout", {}, await sessionCookieFor(user.id))));
    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.get("Set-Cookie")).toMatch(/__session=/);
  });
});

describe("auth callback: provider misbehaviour (final review, Important 1)", () => {
  it("fails cleanly with no session when the profile response is not JSON", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("access_token")) return json({ access_token: "tok" });
      return new Response("<html>maintenance</html>", { status: 200, headers: { "Content-Type": "text/html" } });
    });
    const transient = (await serializeOAuthTransient({ provider: "github", state: "st", codeVerifier: "ver" })).split(";")[0];
    const response = (await callbackLoader(
      callArgs(getRequest("http://localhost:3000/auth/github/callback?code=c&state=st", transient), { provider: "github" }),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/?error=signin");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__session="))).toBe(false);
    expect(cookies.some((c) => c.startsWith("__oauth=") && /Max-Age=0|Expires=/.test(c))).toBe(true);
  });
});
