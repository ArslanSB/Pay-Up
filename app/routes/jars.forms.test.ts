import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { createJar, getJarById } from "../lib/jars.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { action as newAction, loader as newLoader } from "./jars.new";
import { action as editAction, loader as editLoader } from "./jars.$id.edit";

const good = { title: "Doom jar", description: "", amount: "1", currency: "EUR", visibility: "private", slug: "" };
const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private" as const, publicSlug: null };

describe("jars.new", () => {
  it("redirects to / when signed out", async () => {
    const response = await catchResponse(newAction(callArgs(formRequest("http://localhost:3000/jars/new", good))));
    expect(response.headers.get("Location")).toBe("/");
  });
  it("loader hands the form the public link prefix", async () => {
    const user = makeUser();
    const data = await newLoader(callArgs(getRequest("http://localhost:3000/jars/new", await sessionCookieFor(user.id))));
    expect(data).toEqual({ slugPrefix: "http://localhost:3000/j/" });
  });
  it("creates the jar with a title-derived slug and redirects to it", async () => {
    const user = makeUser();
    const response = (await newAction(callArgs(formRequest("http://localhost:3000/jars/new", good, await sessionCookieFor(user.id))))) as Response;
    expect(response.status).toBe(302);
    const id = response.headers.get("Location")!.split("/").pop()!;
    const jar = getJarById(getDb(), id);
    expect(jar?.ownerId).toBe(user.id);
    expect(jar?.publicSlug).toMatch(/^doom-jar(-[a-z0-9]{4})?$/);
  });
  it("uses an explicit slug", async () => {
    const user = makeUser();
    const response = (await newAction(callArgs(formRequest("http://localhost:3000/jars/new", { ...good, slug: "My-Own-Doom" }, await sessionCookieFor(user.id))))) as Response;
    const id = response.headers.get("Location")!.split("/").pop()!;
    expect(getJarById(getDb(), id)?.publicSlug).toBe("my-own-doom");
  });
  it("rejects a taken explicit slug with the field error and keeps the values", async () => {
    const owner = makeUser();
    createJar(getDb(), owner.id, { ...input, publicSlug: "already-mine" });
    const result = await newAction(callArgs(formRequest("http://localhost:3000/jars/new", { ...good, slug: "already-mine" }, await sessionCookieFor(makeUser().id))));
    expect(result).toMatchObject({ data: { errors: { slug: "That link is taken." }, values: { title: "Doom jar", slug: "already-mine" } }, init: { status: 400 } });
  });
  it("returns field errors on bad input", async () => {
    const user = makeUser();
    const result = await newAction(callArgs(formRequest("http://localhost:3000/jars/new", { ...good, title: "" }, await sessionCookieFor(user.id))));
    expect(result).toMatchObject({ data: { errors: { title: "Title is required." } }, init: { status: 400 } });
  });
});

describe("jars.$id.edit", () => {
  it("404s for a foreign jar on loader and action", async () => {
    const owner = makeUser();
    const other = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const cookie = await sessionCookieFor(other.id);
    expect((await catchResponse(editLoader(callArgs(getRequest(`http://localhost:3000/jars/${jar.id}/edit`, cookie), { id: jar.id })))).status).toBe(404);
    expect((await catchResponse(editAction(callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { intent: "delete" }, cookie), { id: jar.id })))).status).toBe(404);
  });
  it("loader provides values with the current slug and the prefix", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, { ...input, publicSlug: "edit-me" });
    const data = await editLoader(callArgs(getRequest(`http://localhost:3000/jars/${jar.id}/edit`, await sessionCookieFor(owner.id)), { id: jar.id }));
    expect(data.values.slug).toBe("edit-me");
    expect(data.slugPrefix).toBe("http://localhost:3000/j/");
  });
  it("saves changes and keeps the slug when it is sent back unchanged", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const response = (await editAction(
      callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { ...good, intent: "save", title: "Swear jar", amount: "0,50", slug: jar.publicSlug }, await sessionCookieFor(owner.id)), { id: jar.id }),
    )) as Response;
    expect(response.headers.get("Location")).toBe(`/jars/${jar.id}`);
    expect(getJarById(getDb(), jar.id)).toMatchObject({ title: "Swear jar", fineAmount: 50, publicSlug: jar.publicSlug });
  });
  it("changes the slug and frees the old one", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const old = jar.publicSlug;
    await editAction(callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { ...good, intent: "save", slug: "fresh-link" }, await sessionCookieFor(owner.id)), { id: jar.id }));
    expect(getJarById(getDb(), jar.id)?.publicSlug).toBe("fresh-link");
    expect(getJarById(getDb(), jar.id)?.publicSlug).not.toBe(old);
  });
  it("rejects a slug taken by another jar", async () => {
    const owner = makeUser();
    createJar(getDb(), owner.id, { ...input, publicSlug: "someone-elses" });
    const jar = createJar(getDb(), owner.id, input);
    const result = await editAction(callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { ...good, intent: "save", slug: "someone-elses" }, await sessionCookieFor(owner.id)), { id: jar.id }));
    expect(result).toMatchObject({ data: { errors: { slug: "That link is taken." } }, init: { status: 400 } });
  });
  it("no longer has a reset-link intent", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const result = await editAction(callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { intent: "reset-link" }, await sessionCookieFor(owner.id)), { id: jar.id }));
    expect(result).toMatchObject({ init: { status: 400 } });
    expect(getJarById(getDb(), jar.id)?.publicSlug).toBe(jar.publicSlug);
  });
  it("deletes and redirects to the dashboard", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const response = (await editAction(callArgs(formRequest(`http://localhost:3000/jars/${jar.id}/edit`, { intent: "delete" }, await sessionCookieFor(owner.id)), { id: jar.id }))) as Response;
    expect(response.headers.get("Location")).toBe("/jars");
    expect(getJarById(getDb(), jar.id)).toBeNull();
  });
});
