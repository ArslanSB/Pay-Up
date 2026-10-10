import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { addFine, createJar, getHistory, settle, updateJar } from "../lib/jars.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as fineAction } from "./api.v1.jars.$id.fines.$fineId";
import { action as finesAction } from "./api.v1.jars.$id.fines";
import { action as settleAction } from "./api.v1.jars.$id.settlements";

const BASE = "http://localhost:3000/api/v1";
const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private" as const, publicSlug: null };

function setup() {
  const user = makeUser();
  const token = deviceTokenFor(user.id, "watch");
  const jar = createJar(getDb(), user.id, input);
  return { user, token, jar };
}
const tap = (token: string, jarId: string, json: unknown) =>
  finesAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/fines`, { token, body: json }), { id: jarId }));
const undo = (token: string, jarId: string, fineId: string) =>
  fineAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/fines/${fineId}`, { method: "DELETE", token }), { id: jarId, fineId }));
const settleUp = (token: string, jarId: string, json: unknown = {}) =>
  settleAction(callArgs(apiRequest(`${BASE}/jars/${jarId}/settlements`, { token, body: json }), { id: jarId }));

describe("POST /api/v1/jars/:id/fines", () => {
  it("adds a fine at the jar's current amount and returns the new balance", async () => {
    const { token, jar } = setup();
    updateJar(getDb(), jar.id, { ...input, fineAmount: 150, publicSlug: jar.publicSlug });
    const response = await tap(token, jar.id, { note: " on the wrist " });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.fine).toMatchObject({ amount: 150, note: "on the wrist" });
    expect(json.balance).toEqual({ total: 150, count: 1 });
  });
  it("stores a replayed tap once", async () => {
    const { token, jar } = setup();
    const clientId = "0b7c4f2e-1111-4a2b-9c3d-123456789abc";
    const first = await (await tap(token, jar.id, { clientId })).json();
    const again = await tap(token, jar.id, { clientId });
    expect(again.status).toBe(200);
    const json = await again.json();
    expect(json.fine.id).toBe(first.fine.id);
    expect(json.balance).toEqual({ total: 100, count: 1 });
  });
  it("keeps a recent offline tap's time", async () => {
    const { token, jar } = setup();
    const createdAt = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    expect((await (await tap(token, jar.id, { createdAt })).json()).fine.createdAt).toBe(createdAt);
  });
  it("counts an offline tap that arrives after a settle as unsettled, even with an earlier time (Review Focus 5)", async () => {
    const { token, jar } = setup();
    const tappedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    addFine(getDb(), jar.id, null);
    settle(getDb(), jar.id, null);
    const json = await (await tap(token, jar.id, { clientId: "late-tap", createdAt: tappedAt })).json();
    expect(json.balance).toEqual({ total: 100, count: 1 });
    expect(getHistory(getDb(), jar.id).settlements[0]).toMatchObject({ total: 100, fineCount: 1 });
  });
  it("validates the note and client id, and rejects a note that is not text", async () => {
    const { token, jar } = setup();
    const long = await tap(token, jar.id, { note: "n".repeat(141), clientId: "has spaces" });
    expect(long.status).toBe(400);
    expect((await long.json()).error.fields).toEqual({ note: "Note must be 140 characters or fewer.", clientId: "Use 1 to 64 letters, digits or dashes." });
    const typed = await tap(token, jar.id, { note: 42 });
    expect(typed.status).toBe(400);
    expect((await typed.json()).error.code).toBe("invalid_request");
  });
  it("404s another user's jar", async () => {
    const { jar } = setup();
    expect((await tap(deviceTokenFor(makeUser().id), jar.id, {})).status).toBe(404);
  });
});

describe("DELETE /api/v1/jars/:id/fines/:fineId", () => {
  it("removes an unsettled fine, 409s a settled one and 404s a missing one", async () => {
    const { token, jar } = setup();
    const keep = addFine(getDb(), jar.id, null)!;
    const response = await undo(token, jar.id, keep.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balance: { total: 0, count: 0 } });
    const settled = addFine(getDb(), jar.id, null)!;
    settle(getDb(), jar.id, null);
    const refused = await undo(token, jar.id, settled.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toEqual({ code: "already_settled", message: "That fine is already settled." });
    expect((await undo(token, jar.id, "nope")).status).toBe(404);
  });
});

describe("POST /api/v1/jars/:id/settlements", () => {
  it("settles once, then says there is nothing to settle", async () => {
    const { token, jar } = setup();
    addFine(getDb(), jar.id, null);
    const first = await settleUp(token, jar.id, { note: "holiday fund" });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ settlement: { total: 100, fineCount: 1, note: "holiday fund" }, balance: { total: 0, count: 0 } });
    const second = await settleUp(token, jar.id);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toEqual({ code: "nothing_to_settle", message: "Nothing to settle yet." });
  });
});
