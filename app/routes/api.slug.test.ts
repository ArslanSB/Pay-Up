import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { createJar } from "../lib/jars.server";
import { callArgs, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader } from "./api.slug";

const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "public" as const, publicSlug: null };
const url = (q: string) => `http://localhost:3000/api/slug?${q}`;

describe("GET /api/slug", () => {
  it("answers 401 when signed out", async () => {
    const result = await loader(callArgs(getRequest(url("slug=doom-jar"))));
    expect(result).toMatchObject({ init: { status: 401 } });
  });
  it("reports a free, valid slug as available", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(url("slug=free-as-air"), cookie)))).toEqual({ slug: "free-as-air", valid: true, available: true });
  });
  it("normalises case and whitespace before checking", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(url("slug=%20Free-As-Air%20"), cookie)))).toEqual({ slug: "free-as-air", valid: true, available: true });
  });
  it("reports a taken slug, unless the caller's own jar holds it", async () => {
    const me = makeUser();
    const jar = createJar(getDb(), me.id, input);
    const cookie = await sessionCookieFor(me.id);
    expect(await loader(callArgs(getRequest(url("slug=doom-jar"), cookie)))).toEqual({ slug: "doom-jar", valid: true, available: false });
    expect(await loader(callArgs(getRequest(url(`slug=doom-jar&jar=${jar.id}`), cookie)))).toEqual({ slug: "doom-jar", valid: true, available: true });
  });
  it("ignores a jar id that belongs to someone else", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, { ...input, publicSlug: "owners-jar" });
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(url(`slug=owners-jar&jar=${jar.id}`), cookie)))).toEqual({ slug: "owners-jar", valid: true, available: false });
  });
  it("marks an invalid slug as neither valid nor available", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(url("slug=Doom%20Jar"), cookie)))).toEqual({ slug: "doom jar", valid: false, available: false });
    expect(await loader(callArgs(getRequest(url(""), cookie)))).toEqual({ slug: "", valid: false, available: false });
  });
});
