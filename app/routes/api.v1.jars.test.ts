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
  it("PUT keeps a custom link when publicSlug is absent, and derives a fresh one for null", async () => {
    const { user, token } = owner();
    const jar = createJar(getDb(), user.id, { ...input, publicSlug: "my-custom-link" });
    const kept = await jarCall("PUT", token, jar.id, { ...body, fineAmount: 175 });
    expect(kept.status).toBe(200);
    expect((await kept.json()).jar).toMatchObject({ fineAmount: 175, publicUrl: "http://localhost:3000/j/my-custom-link" });
    const derived = await jarCall("PUT", token, jar.id, { ...body, publicSlug: null });
    const { publicUrl } = (await derived.json()).jar;
    expect(publicUrl).toMatch(/^http:\/\/localhost:3000\/j\/doom-jar/);
    expect(publicUrl).not.toContain("my-custom-link");
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
