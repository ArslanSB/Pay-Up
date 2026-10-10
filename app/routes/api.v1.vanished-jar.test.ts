import { describe, expect, it, vi } from "vitest";
import { getDb } from "../lib/db.server";
import { createJar } from "../lib/jars.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as finesAction } from "./api.v1.jars.$id.fines";
import { action as jarAction } from "./api.v1.jars.$id";

// A jar deleted between requireJar and the write can't be staged in order, so the writes are stubbed to report it gone.
vi.mock("../lib/jars.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/jars.server")>()),
  updateJar: vi.fn(() => null),
  addClientFine: vi.fn(() => null),
}));

const BASE = "http://localhost:3000/api/v1";
const input = { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private" as const, publicSlug: null };

describe("a jar that vanishes mid-request", () => {
  it("is a 404 for PUT /jars/:id and for POST /jars/:id/fines", async () => {
    const user = makeUser();
    const token = deviceTokenFor(user.id);
    const jar = createJar(getDb(), user.id, input);
    const put = await jarAction(callArgs(apiRequest(`${BASE}/jars/${jar.id}`, { method: "PUT", token, body: input }), { id: jar.id }));
    expect(put.status).toBe(404);
    expect((await put.json()).error.code).toBe("not_found");
    const fine = await finesAction(callArgs(apiRequest(`${BASE}/jars/${jar.id}/fines`, { token, body: {} }), { id: jar.id }));
    expect(fine.status).toBe(404);
    expect((await fine.json()).error.code).toBe("not_found");
  });
});
