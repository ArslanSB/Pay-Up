import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { addFine, createJar, getBalance, getHistory, settle } from "../lib/jars.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { action, loader } from "./jars.$id";

const input = { title: "Negativity jar", description: "", fineAmount: 100, currency: "EUR", visibility: "public" as const, publicSlug: null };

async function setup() {
  const owner = makeUser();
  const jar = createJar(getDb(), owner.id, input);
  const cookie = await sessionCookieFor(owner.id);
  const url = `http://localhost:3000/jars/${jar.id}`;
  return { owner, jar, cookie, url };
}

describe("owner jar loader", () => {
  it("404s for a foreign or missing jar", async () => {
    const { jar } = await setup();
    const other = makeUser();
    const cookie = await sessionCookieFor(other.id);
    expect((await catchResponse(loader(callArgs(getRequest(`http://localhost:3000/jars/${jar.id}`, cookie), { id: jar.id })))).status).toBe(404);
    expect((await catchResponse(loader(callArgs(getRequest("http://localhost:3000/jars/nope", cookie), { id: "nope" })))).status).toBe(404);
  });
  it("returns the view with the public url", async () => {
    const { jar, cookie, url } = await setup();
    const data = await loader(callArgs(getRequest(url, cookie), { id: jar.id }));
    expect(data.view.jar.title).toBe("Negativity jar");
    expect(data.publicUrl).toBe(`http://localhost:3000/j/${jar.publicSlug}`);
  });
});

describe("owner jar action", () => {
  it("fine adds a fine with an optional note", async () => {
    const { jar, cookie, url } = await setup();
    const result = await action(callArgs(formRequest(url, { intent: "fine", note: " the weather " }, cookie), { id: jar.id }));
    expect(result).toEqual({ ok: true, intent: "fine" });
    expect(getHistory(getDb(), jar.id).unsettled[0].note).toBe("the weather");
  });
  it("fine rejects an over-long note", async () => {
    const { jar, cookie, url } = await setup();
    const result = await action(callArgs(formRequest(url, { intent: "fine", note: "n".repeat(141) }, cookie), { id: jar.id }));
    expect(result).toMatchObject({ data: { ok: false, error: "Note must be 140 characters or fewer." }, init: { status: 400 } });
  });
  it("undo deletes an unsettled fine and refuses a settled one", async () => {
    const { jar, cookie, url } = await setup();
    const fine = addFine(getDb(), jar.id, null)!;
    expect(await action(callArgs(formRequest(url, { intent: "undo", fineId: fine.id }, cookie), { id: jar.id }))).toEqual({ ok: true, intent: "undo" });
    const settled = addFine(getDb(), jar.id, null)!;
    settle(getDb(), jar.id, null);
    const result = await action(callArgs(formRequest(url, { intent: "undo", fineId: settled.id }, cookie), { id: jar.id }));
    expect(result).toMatchObject({ data: { ok: false, error: "That fine is already settled." } });
  });
  it("settle stamps the balance and a second settle is refused (Review Focus 4)", async () => {
    const { jar, cookie, url } = await setup();
    addFine(getDb(), jar.id, null);
    const first = await action(callArgs(formRequest(url, { intent: "settle", note: "holiday fund" }, cookie), { id: jar.id }));
    expect(first).toMatchObject({ ok: true, intent: "settle" });
    expect(String((first as { message: string }).message).replace(/ /g, " ")).toBe("Settled 1,00 €");
    expect(getBalance(getDb(), jar.id)).toEqual({ total: 0, count: 0 });
    const second = await action(callArgs(formRequest(url, { intent: "settle" }, cookie), { id: jar.id }));
    expect(second).toMatchObject({ data: { ok: false, error: "Nothing to settle yet." }, init: { status: 400 } });
    expect(getHistory(getDb(), jar.id).settlements).toHaveLength(1);
  });
  it("404s for a foreign jar", async () => {
    const { jar, url } = await setup();
    const other = await sessionCookieFor(makeUser().id);
    expect((await catchResponse(action(callArgs(formRequest(url, { intent: "fine" }, other), { id: jar.id })))).status).toBe(404);
  });
  it("rejects unknown intents", async () => {
    const { jar, cookie, url } = await setup();
    const result = await action(callArgs(formRequest(url, { intent: "explode" }, cookie), { id: jar.id }));
    expect(result).toMatchObject({ data: { ok: false, error: "Unknown action." }, init: { status: 400 } });
  });
});
