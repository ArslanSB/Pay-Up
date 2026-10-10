import type { Route } from "./+types/api.v1.jars.$id.settlements";
import { api, apiError, apiJson, methodNotAllowed, optionalStringField, readJsonBody, requireDevice, requireJar, validationError } from "../lib/api.server";
import { settlementJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { getBalance, settle } from "../lib/jars.server";
import { parseNote } from "../lib/validation";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/jars/:id/settlements { note? }: settle the unsettled balance. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const note = parseNote(optionalStringField(await readJsonBody(request), "note"));
  if (!note.ok) return validationError({ note: note.error });
  const settlement = settle(db, jar.id, note.note);
  if (!settlement) return apiError(409, "nothing_to_settle", "Nothing to settle yet.");
  return apiJson({ settlement: settlementJson(settlement), balance: getBalance(db, jar.id) }, 201);
});
