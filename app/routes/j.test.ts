import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { createJar } from "../lib/jars.server";
import { callArgs, catchResponse, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader, meta } from "./j.$slug";

const input = { title: "Negativity jar", description: "Every gripe costs 1 €", fineAmount: 100, currency: "EUR", visibility: "public" as const, publicSlug: null };

describe("public jar loader", () => {
  it("404s for a private jar and an unknown slug, with no distinguishing detail", async () => {
    const owner = makeUser();
    const priv = createJar(getDb(), owner.id, { ...input, visibility: "private", publicSlug: null });
    const a = await catchResponse(loader(callArgs(getRequest(`http://localhost:3000/j/${priv.publicSlug}`), { slug: priv.publicSlug })));
    const b = await catchResponse(loader(callArgs(getRequest("http://localhost:3000/j/nope"), { slug: "nope" })));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
  });
  it("shows a public jar to anyone and flags the owner", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, input);
    const anon = await loader(callArgs(getRequest(`http://localhost:3000/j/${jar.publicSlug}`), { slug: jar.publicSlug }));
    expect(anon.isOwner).toBe(false);
    expect(anon.view.jar.title).toBe("Negativity jar");
    const mine = await loader(callArgs(getRequest(`http://localhost:3000/j/${jar.publicSlug}`, await sessionCookieFor(owner.id)), { slug: jar.publicSlug }));
    expect(mine.isOwner).toBe(true);
    const other = await loader(callArgs(getRequest(`http://localhost:3000/j/${jar.publicSlug}`, await sessionCookieFor(makeUser().id)), { slug: jar.publicSlug }));
    expect(other.isOwner).toBe(false);
  });
  it("meta uses the jar title and description", () => {
    const tags = meta({ loaderData: { isOwner: false, view: { jar: { title: "Swear jar", description: "50 cents a word" }, balanceLabel: "6,50 €" } } } as never);
    expect(tags).toContainEqual({ title: "Swear jar" });
    expect(tags).toContainEqual({ name: "description", content: "50 cents a word" });
    expect(tags).toContainEqual({ property: "og:title", content: "Swear jar" });
  });
});
