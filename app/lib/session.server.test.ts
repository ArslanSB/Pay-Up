import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.server";
import {
  clearOAuthTransient,
  createUserSession,
  destroyUserSession,
  getUserId,
  parseOAuthTransient,
  requireUser,
  serializeOAuthTransient,
} from "./session.server";
import { upsertUser } from "./users.server";

function cookieFrom(response: Response): string {
  const header = response.headers.get("Set-Cookie");
  if (!header) throw new Error("no Set-Cookie");
  return header.split(";")[0];
}

describe("user session", () => {
  it("round-trips the user id through a signed cookie", async () => {
    const response = await createUserSession("user-1", "/jars");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/jars");
    const cookie = cookieFrom(response);
    expect(cookie.startsWith("__session=")).toBe(true);
    expect(await getUserId(new Request("http://x/", { headers: { Cookie: cookie } }))).toBe("user-1");
  });
  it("rejects a tampered cookie", async () => {
    const cookie = cookieFrom(await createUserSession("user-1", "/"));
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    expect(await getUserId(new Request("http://x/", { headers: { Cookie: tampered } }))).toBeNull();
  });
  it("requireUser redirects to / without a session and returns the user with one", async () => {
    const db = openDatabase(":memory:");
    const user = upsertUser(db, { provider: "github", providerId: "1", email: null, name: "T", avatarUrl: null });
    await expect(requireUser(new Request("http://x/jars"), db)).rejects.toSatisfy(
      (r: unknown) => r instanceof Response && r.status === 302 && r.headers.get("Location") === "/",
    );
    const cookie = cookieFrom(await createUserSession(user.id, "/"));
    expect((await requireUser(new Request("http://x/jars", { headers: { Cookie: cookie } }), db)).id).toBe(user.id);
  });
  it("destroyUserSession clears the cookie", async () => {
    const cookie = cookieFrom(await createUserSession("user-1", "/"));
    const response = await destroyUserSession(new Request("http://x/", { headers: { Cookie: cookie } }), "/");
    expect(response.headers.get("Set-Cookie")).toMatch(/__session=;|Max-Age=0|Expires=/);
  });
});

describe("oauth transient cookie", () => {
  it("round-trips state and verifier", async () => {
    const header = await serializeOAuthTransient({ provider: "google", state: "s1", codeVerifier: "v1" });
    const parsed = await parseOAuthTransient(new Request("http://x/", { headers: { Cookie: header.split(";")[0] } }));
    expect(parsed).toEqual({ provider: "google", state: "s1", codeVerifier: "v1" });
  });
  it("returns null when absent or malformed", async () => {
    expect(await parseOAuthTransient(new Request("http://x/"))).toBeNull();
    expect(await parseOAuthTransient(new Request("http://x/", { headers: { Cookie: "__oauth=garbage" } }))).toBeNull();
  });
  it("clearOAuthTransient expires the cookie", async () => {
    expect(await clearOAuthTransient()).toMatch(/Max-Age=0|Expires=/);
  });
});
