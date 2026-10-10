import type { Route } from "./+types/api.v1.links.$code";
import { api, apiError, apiJson, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { cancelLink, findLink, LINK_EXPIRED_MESSAGE, normalizeUserCode } from "../lib/links.server";

/** GET /api/v1/links/:code: the phone app asks which device a watch's code belongs to. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  const link = code ? findLink(db, code) : null;
  if (!link || link.approved) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiJson({ kind: link.kind, name: link.name, expiresAt: link.expiresAt });
});

/** DELETE /api/v1/links/:code: the phone app cancels; the device's next poll gets 410. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["GET", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const code = normalizeUserCode(params.code);
  if (!code || !cancelLink(db, code, user.id)) return apiError(404, "not_found", LINK_EXPIRED_MESSAGE);
  return apiNoContent();
});
