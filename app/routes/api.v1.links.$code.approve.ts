import type { Route } from "./+types/api.v1.links.$code.approve";
import { api, apiError, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { approveLink, LINK_EXPIRED_MESSAGE, normalizeUserCode } from "../lib/links.server";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/links/:code/approve: the phone app approves a watch's code for its own user. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  if (!code || !approveLink(db, code, user.id)) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiNoContent();
});
