import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { createJar } from "../lib/jars.server";
import { findUserById } from "../lib/users.server";
import { callArgs, catchResponse, formRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { action, loader } from "./account";

describe("/account", () => {
  it("GET redirects to the dashboard", () => {
    expect((loader() as Response).headers.get("Location")).toBe("/jars");
  });
  it("delete needs a session", async () => {
    const response = await catchResponse(action(callArgs(formRequest("http://localhost:3000/account", { intent: "delete" }))));
    expect(response.headers.get("Location")).toBe("/");
  });
  it("delete removes the user and their jars, clears the session and lands on the goodbye landing", async () => {
    const user = makeUser();
    createJar(getDb(), user.id, { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    const response = (await action(callArgs(formRequest("http://localhost:3000/account", { intent: "delete" }, await sessionCookieFor(user.id))))) as Response;
    expect(response.headers.get("Location")).toBe("/?deleted=1");
    expect(response.headers.get("Set-Cookie")).toMatch(/__session=;|Max-Age=0|Expires=/);
    expect(findUserById(getDb(), user.id)).toBeNull();
    expect(getDb().prepare("SELECT COUNT(*) FROM jars WHERE owner_id = ?").pluck().get(user.id)).toBe(0);
  });
  it("rejects other intents", async () => {
    const user = makeUser();
    const result = await action(callArgs(formRequest("http://localhost:3000/account", { intent: "explode" }, await sessionCookieFor(user.id))));
    expect(result).toMatchObject({ init: { status: 400 } });
    expect(findUserById(getDb(), user.id)).not.toBeNull();
  });
});
