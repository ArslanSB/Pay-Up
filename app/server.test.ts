import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server.js";

type Closeable = { close: (cb: () => void) => void };
const servers: Closeable[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((resolve) => s.close(() => resolve()));
});

/** Boots the app with a probe handler that reports how Express sees the request. */
async function boot(options: { trustProxy: string | boolean; publicOrigin?: string | null }) {
  const app = createApp({
    ...options,
    handler: (req, res) =>
      res.json({ protocol: req.protocol, host: req.hostname, hostHeader: req.get("host"), ip: req.ip, clientIp: req.get("x-payup-client-ip") }),
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const forwarded = { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "payup.example.com", "X-Forwarded-For": "203.0.113.9" };

describe("createApp behind a reverse proxy", () => {
  it("passes Express's view of the client address to the app, overwriting a client-sent value", async () => {
    const base = await boot({ trustProxy: "loopback, linklocal, uniquelocal", publicOrigin: null });
    const seen = await (await fetch(`${base}/probe`, { headers: { ...forwarded, "X-Payup-Client-Ip": "1.2.3.4" } })).json();
    expect(seen.clientIp).toBe("203.0.113.9");
  });
  it("sees the forwarded origin when the proxy is trusted (the default trusts private networks)", async () => {
    const base = await boot({ trustProxy: "loopback, linklocal, uniquelocal", publicOrigin: null });
    const seen = await (await fetch(`${base}/probe`, { headers: forwarded })).json();
    expect(seen).toMatchObject({ protocol: "https", host: "payup.example.com", ip: "203.0.113.9" });
  });
  it("ignores forwarded headers when the proxy is not trusted", async () => {
    const base = await boot({ trustProxy: false, publicOrigin: null });
    const seen = await (await fetch(`${base}/probe`, { headers: forwarded })).json();
    expect(seen.protocol).toBe("http");
    expect(seen.host).toBe("127.0.0.1");
  });
  it("normalises host and scheme to the public origin, whatever the proxy forwards", async () => {
    const base = await boot({ trustProxy: "loopback, linklocal, uniquelocal", publicOrigin: "https://payup.example.com" });
    const bare = await (await fetch(`${base}/probe`)).json();
    expect(bare).toMatchObject({ protocol: "https", host: "payup.example.com", hostHeader: "payup.example.com" });
    const upstreamHost = await (await fetch(`${base}/probe`, { headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "payup:3000" } })).json();
    expect(upstreamHost).toMatchObject({ protocol: "https", host: "payup.example.com", hostHeader: "payup.example.com" });
  });
  it("keeps a port from the public origin", async () => {
    const base = await boot({ trustProxy: true, publicOrigin: "http://localhost:3000" });
    const seen = await (await fetch(`${base}/probe`)).json();
    expect(seen).toMatchObject({ protocol: "http", host: "localhost", hostHeader: "localhost:3000" });
  });
  it("serves the health check without touching the app", async () => {
    const base = await boot({ trustProxy: false, publicOrigin: null });
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
