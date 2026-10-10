import type { Route } from "./+types/api.v1.jars.$id.fines";
import { api, apiJson, jarNotFound, methodNotAllowed, optionalStringField, readJsonBody, requireDevice, requireJar, validationError } from "../lib/api.server";
import { fineJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { addClientFine, getBalance } from "../lib/jars.server";
import { parseNote } from "../lib/validation";

const CLIENT_ID = /^[A-Za-z0-9-]{1,64}$/;
const CLIENT_ID_MESSAGE = "Use 1 to 64 letters, digits or dashes.";

export const loader = api(async () => methodNotAllowed(["POST"]));

/** POST /api/v1/jars/:id/fines { note?, clientId?, createdAt? }: 201 for a new fine, 200 for a replayed clientId. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  const body = await readJsonBody(request);
  const note = parseNote(optionalStringField(body, "note"));
  const clientId = optionalStringField(body, "clientId");
  const createdAt = optionalStringField(body, "createdAt");
  const badClientId = clientId !== null && !CLIENT_ID.test(clientId);
  if (!note.ok || badClientId) {
    return validationError({
      ...(note.ok ? {} : { note: note.error }),
      ...(badClientId ? { clientId: CLIENT_ID_MESSAGE } : {}),
    });
  }
  const result = addClientFine(db, jar.id, { note: note.note, clientId, createdAt });
  if (!result) return jarNotFound();
  return apiJson({ fine: fineJson(result.fine), balance: getBalance(db, jar.id) }, result.created ? 201 : 200);
});
