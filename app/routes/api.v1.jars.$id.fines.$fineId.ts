import type { Route } from "./+types/api.v1.jars.$id.fines.$fineId";
import { api, apiError, apiJson, methodNotAllowed, requireDevice, requireJar } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { deleteFine, getBalance } from "../lib/jars.server";

export const loader = api(async () => methodNotAllowed(["DELETE"]));

/** DELETE /api/v1/jars/:id/fines/:fineId: undo or delete an unsettled fine. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const result = deleteFine(db, jar.id, params.fineId);
  if (result === "settled") return apiError(409, "already_settled", "That fine is already settled.");
  if (result === "missing") return apiError(404, "not_found", "That fine doesn't exist.");
  return apiJson({ balance: getBalance(db, jar.id) });
});
