// Production server. Replaces react-router-serve so we can tell Express to trust the reverse
// proxy in front of it: without that, request.url is reconstructed as http://<internal host>,
// the browser's Origin header no longer matches it, and React Router refuses every action.
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Express's "trust proxy" accepts booleans, hop counts, or a list of names/addresses. */
export function parseTrustProxy(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim();
  if (text === "" || text === "true") return true;
  if (text === "false") return false;
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

/**
 * @param {object} [options]
 * @param {string | boolean} [options.trustProxy] Express trust-proxy setting; default trusts private networks.
 * @param {unknown} [options.build] The server build module (or a function returning it).
 * @param {string | null} [options.publicOrigin] The one origin this app serves (APP_URL). When set, every request is
 *   treated as addressed to it, so request.url matches the browser's Origin header no matter what the proxy forwards.
 * @param {import("express").RequestHandler} [options.handler] Replaces the React Router handler; for tests.
 */
export function createApp({
  trustProxy = process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal",
  publicOrigin = process.env.APP_URL ?? null,
  build,
  handler,
} = {}) {
  const app = express();
  app.set("trust proxy", parseTrustProxy(trustProxy));
  app.disable("x-powered-by");
  const origin = publicOrigin ? new URL(publicOrigin) : null;
  if (origin) {
    app.use((req, _res, next) => {
      req.headers.host = origin.host;
      req.headers["x-forwarded-host"] = origin.host;
      req.headers["x-forwarded-proto"] = origin.protocol.replace(":", "");
      next();
    });
  }
  // The API rate-limits by client address. React Router only sees a Request, so hand it Express's view of the
  // address (which honours trust proxy) in a header, overwriting anything the client sent.
  app.use((req, _res, next) => {
    req.headers["x-payup-client-ip"] = req.ip ?? "";
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.type("text").send("ok");
  });
  app.use(compression());
  app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
  app.use(express.static("build/client", { maxAge: "1h" }));
  app.use(morgan("tiny"));
  app.use(handler ?? createRequestHandler({ build, mode: process.env.NODE_ENV }));
  return app;
}

async function start() {
  const build = await import("./build/server/index.js");
  const app = createApp({ build });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`[pay-up] listening on http://localhost:${port} (trust proxy: ${JSON.stringify(app.get("trust proxy"))})`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start();
}
