import type { Route } from "./+types/api.v1.devices.$id";
import { api, apiError, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { revokeDevice } from "../lib/devices.server";

export const loader = api(async () => methodNotAllowed(["DELETE"]));

/** DELETE /api/v1/devices/:id revokes one of the user's devices; `current` signs the caller out. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const db = getDb();
  const { device, user } = requireDevice(request, db);
  const id = params.id === "current" ? device.id : params.id;
  if (!revokeDevice(db, user.id, id)) return apiError(404, "not_found", "That device doesn't exist.");
  return apiNoContent();
});
