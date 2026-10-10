import type { Route } from "./+types/api.v1.links.token";
import { api, apiError, apiJson, methodNotAllowed, readJsonBody } from "../lib/api.server";
import { deviceJson, userJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { LINK_EXPIRED_MESSAGE, pollLink } from "../lib/links.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links/token { deviceCode }: the device polls until its link is approved. */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const { deviceCode } = await readJsonBody(request);
  if (typeof deviceCode !== "string" || deviceCode === "") return apiError(400, "invalid_request", "deviceCode is required.");
  const result = pollLink(getDb(), deviceCode);
  if (result.status === "pending") return apiJson({ status: "pending" }, 202);
  if (result.status === "slow_down") return apiError(429, "slow_down", "Poll less often.");
  if (result.status === "expired") return apiError(410, "expired", LINK_EXPIRED_MESSAGE);
  return apiJson({ token: result.token, device: deviceJson(result.device, result.device.id), user: userJson(result.user) });
});
