import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { authenticateDevice, createDevice } from "../lib/devices.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { action, loader } from "./devices";

const ORIGIN = "http://localhost:3000";

describe("/devices", () => {
  it("sends a visitor to the landing", async () => {
    const response = await catchResponse(loader(callArgs(getRequest(`${ORIGIN}/devices`))));
    expect(response.headers.get("Location")).toBe("/");
  });
  it("lists the user's devices with plain-language dates", async () => {
    const user = makeUser();
    createDevice(getDb(), user.id, "watch", "Pixel Watch 3");
    createDevice(getDb(), makeUser().id, "phone", "Not mine");
    const data = await loader(callArgs(getRequest(`${ORIGIN}/devices`, await sessionCookieFor(user.id), { "Accept-Language": "en-GB" })));
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0]).toMatchObject({ name: "Pixel Watch 3", kindLabel: "Watch", usedLabel: "Last used today" });
    expect(data.devices[0].addedLabel).toMatch(/^Added \d{1,2} [A-Z][a-z]+$/);
  });
  it("revokes one of the user's devices", async () => {
    const user = makeUser();
    const { device, token } = createDevice(getDb(), user.id, "watch", "W");
    const result = await action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "revoke", deviceId: device.id }, await sessionCookieFor(user.id))));
    expect(result).toEqual({ ok: true });
    expect(authenticateDevice(getDb(), token)).toBeNull();
  });
  it("404s someone else's device and rejects other intents", async () => {
    const { device } = createDevice(getDb(), makeUser().id, "watch", "W");
    const cookie = await sessionCookieFor(makeUser().id);
    expect((await catchResponse(action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "revoke", deviceId: device.id }, cookie))))).status).toBe(404);
    expect(await action(callArgs(formRequest(`${ORIGIN}/devices`, { intent: "explode" }, cookie)))).toMatchObject({ init: { status: 400 } });
  });
});
