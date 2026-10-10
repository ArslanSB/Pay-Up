import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { authenticateDevice } from "../lib/devices.server";
import { apiRequest, callArgs, deviceTokenFor, makeUser } from "../test/helpers";
import { action as codeAction, loader as codeLoader } from "./api.v1.links.$code";
import { action as approveAction } from "./api.v1.links.$code.approve";
import { action as startAction, loader as startLoader } from "./api.v1.links";
import { action as tokenAction } from "./api.v1.links.token";

const BASE = "http://localhost:3000/api/v1";
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

async function start(kind = "watch", name = "Pixel Watch 3") {
  const response = await startAction(callArgs(apiRequest(`${BASE}/links`, { body: { kind, name }, ip: freshIp() })));
  return { response, body: await response.json() };
}
const poll = (deviceCode: string) => tokenAction(callArgs(apiRequest(`${BASE}/links/token`, { body: { deviceCode } })));

describe("POST /api/v1/links", () => {
  it("starts a watch link pointing at /link and a phone link pointing at /link/phone", async () => {
    const watch = await start("watch");
    expect(watch.response.status).toBe(201);
    expect(watch.body).toMatchObject({ verificationUrl: "http://localhost:3000/link", interval: 5 });
    expect(watch.body.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(watch.body.verificationUrlComplete).toBe(`http://localhost:3000/link?code=${watch.body.userCode}`);
    expect(watch.body.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const phone = await start("phone", "Pixel 9");
    expect(phone.body.verificationUrlComplete).toBe(`http://localhost:3000/link/phone?code=${phone.body.userCode}`);
  });
  it("validates kind and name", async () => {
    const { response, body } = await start("tablet", " ");
    expect(response.status).toBe(400);
    expect(body.error).toEqual({
      code: "validation",
      message: "Check the highlighted fields.",
      fields: { kind: "Pick phone or watch.", name: "Name must be 1 to 60 characters." },
    });
  });
  it("allows 10 starts per address per 10 minutes", async () => {
    const ip = freshIp();
    const hit = () => startAction(callArgs(apiRequest(`${BASE}/links`, { body: { kind: "watch", name: "W" }, ip })));
    for (let i = 0; i < 10; i++) expect((await hit()).status).toBe(201);
    const limited = await hit();
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect((await start()).response.status).toBe(201);
  });
  it("rejects a token poll body over 16 KB", async () => {
    const response = await poll("x".repeat(17 * 1024));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
  it("answers GET with 405", async () => {
    expect((await startLoader(callArgs(apiRequest(`${BASE}/links`)))).status).toBe(405);
  });
});

describe("POST /api/v1/links/token", () => {
  it("is 202 while pending and 429 when polled too fast", async () => {
    const { body } = await start();
    expect((await poll(body.deviceCode)).status).toBe(202);
    const fast = await poll(body.deviceCode);
    expect(fast.status).toBe(429);
    expect((await fast.json()).error.code).toBe("slow_down");
  });
  it("issues the token once after the phone app approves, then 410", async () => {
    const user = makeUser();
    const phoneToken = deviceTokenFor(user.id, "phone");
    const { body } = await start("watch", "Pixel Watch 3");
    const approved = await approveAction(callArgs(apiRequest(`${BASE}/links/x/approve`, { method: "POST", token: phoneToken }), { code: body.userCode }));
    expect(approved.status).toBe(204);
    const issued = await poll(body.deviceCode);
    expect(issued.status).toBe(200);
    const json = await issued.json();
    expect(json.device).toMatchObject({ kind: "watch", name: "Pixel Watch 3", current: true });
    expect(json.user).toMatchObject({ id: user.id });
    expect(authenticateDevice(getDb(), json.token)?.device.id).toBe(json.device.id);
    const again = await poll(body.deviceCode);
    expect(again.status).toBe(410);
    expect((await again.json()).error).toEqual({ code: "expired", message: "That code has expired. Start again on your device." });
  });
  it("needs a device code", async () => {
    expect((await tokenAction(callArgs(apiRequest(`${BASE}/links/token`, { body: {} })))).status).toBe(400);
  });
});

describe("GET and DELETE /api/v1/links/:code", () => {
  it("tells the phone app which device is asking", async () => {
    const token = deviceTokenFor(makeUser().id);
    const { body } = await start("watch", "Pixel Watch 3");
    const response = await codeLoader(callArgs(apiRequest(`${BASE}/links/x`, { token }), { code: body.userCode.toLowerCase() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "watch", name: "Pixel Watch 3" });
  });
  it("needs a token and 404s an unknown code", async () => {
    const { body } = await start();
    expect((await codeLoader(callArgs(apiRequest(`${BASE}/links/x`), { code: body.userCode }))).status).toBe(401);
    const token = deviceTokenFor(makeUser().id);
    expect((await codeLoader(callArgs(apiRequest(`${BASE}/links/x`, { token }), { code: "BBBB-BBBB" }))).status).toBe(404);
  });
  it("cancels, after which the device gets 410", async () => {
    const token = deviceTokenFor(makeUser().id);
    const { body } = await start();
    expect((await codeAction(callArgs(apiRequest(`${BASE}/links/x`, { method: "DELETE", token }), { code: body.userCode }))).status).toBe(204);
    expect((await poll(body.deviceCode)).status).toBe(410);
  });
});
