import type { Route } from "./+types/api.v1.links";
import { api, apiError, apiJson, clientIp, methodNotAllowed, readJsonBody, validationError } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { isDeviceKind, parseDeviceName } from "../lib/devices.server";
import { env } from "../lib/env.server";
import { formatUserCode, POLL_INTERVAL_S, startLink } from "../lib/links.server";
import { linkStartLimiter } from "../lib/rate-limit.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links { kind, name }: a phone or watch starts signing in (spec 5.2). No token needed. */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!linkStartLimiter.hit(clientIp(request))) return apiError(429, "rate_limited", "Too many sign-in attempts. Wait a few minutes.");
  const body = await readJsonBody(request);
  const kind = body.kind;
  const name = parseDeviceName(body.name);
  if (!isDeviceKind(kind) || name === null) {
    return validationError({
      ...(isDeviceKind(kind) ? {} : { kind: "Pick phone or watch." }),
      ...(name === null ? { name: "Name must be 1 to 60 characters." } : {}),
    });
  }
  const link = startLink(getDb(), kind, name);
  const appUrl = env().appUrl;
  const userCode = formatUserCode(link.userCode);
  const path = kind === "phone" ? "/link/phone" : "/link";
  return apiJson(
    {
      deviceCode: link.deviceCode,
      userCode,
      verificationUrl: `${appUrl}/link`,
      verificationUrlComplete: `${appUrl}${path}?code=${userCode}`,
      expiresAt: link.expiresAt,
      interval: POLL_INTERVAL_S,
    },
    201,
  );
});
