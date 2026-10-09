import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { addFine, createJar } from "../lib/jars.server";
import { callArgs, catchResponse, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader } from "./jars";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("dashboard loader", () => {
  it("redirects to / when signed out", async () => {
    expect((await catchResponse(loader(callArgs(getRequest("http://localhost:3000/jars"))))).headers.get("Location")).toBe("/");
  });
  it("lists only my jars with labels in my locale", async () => {
    const me = makeUser(getDb(), "Arslan");
    const other = makeUser();
    const jar = createJar(getDb(), me.id, { title: "Negativity jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    addFine(getDb(), jar.id, null);
    createJar(getDb(), other.id, { title: "Not mine", description: "", fineAmount: 100, currency: "EUR", visibility: "public", publicSlug: null });
    const data = await loader(callArgs(getRequest("http://localhost:3000/jars", await sessionCookieFor(me.id), { "Accept-Language": "en-US" })));
    expect(data.name).toBe("Arslan");
    expect(data.jars).toEqual([{ id: jar.id, title: "Negativity jar", countLabel: "1 fine", balanceLabel: "€1.00" }]);
    expect(nbsp(data.subtitle)).toBe("€1.00 owed. Ouch.");
  });
});
