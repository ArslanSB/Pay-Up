import type { Route } from "./+types/api.v1.jars.$id";
import {
  api,
  apiJson,
  apiNoContent,
  jarNotFound,
  methodNotAllowed,
  readJsonBody,
  requireDevice,
  requireJar,
  slugTakenError,
  validationError,
} from "../lib/api.server";
import { fineJson, jarJson, settlementJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { deleteJar, getHistory, getJarSummaryForOwner, SlugTakenError, updateJar } from "../lib/jars.server";
import { parseJarJson } from "../lib/validation";

/** GET /api/v1/jars/:id: the jar, its unsettled fines and its settlements, newest first. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = getJarSummaryForOwner(db, params.id, user.id);
  if (!jar) return jarNotFound();
  const history = getHistory(db, jar.id);
  return apiJson({
    jar: jarJson(jar, env().appUrl),
    unsettled: history.unsettled.map(fineJson),
    settlements: history.settlements.map(settlementJson),
  });
});

/** PUT replaces the jar's fields; DELETE removes it. Both 404 on another user's jar. */
export const action = api(async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "PUT" && request.method !== "DELETE") return methodNotAllowed(["GET", "PUT", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const jar = requireJar(db, user.id, params.id);
  if (request.method === "DELETE") {
    deleteJar(db, jar.id);
    return apiNoContent();
  }
  const body = await readJsonBody(request);
  const parsed = parseJarJson(body);
  if (!parsed.ok) return validationError(parsed.fields);
  const input = "publicSlug" in body ? parsed.input : { ...parsed.input, publicSlug: jar.publicSlug };
  try {
    if (!updateJar(db, jar.id, input)) return jarNotFound();
  } catch (error) {
    if (error instanceof SlugTakenError) return slugTakenError();
    throw error;
  }
  const updated = getJarSummaryForOwner(db, jar.id, user.id);
  if (!updated) return jarNotFound();
  return apiJson({ jar: jarJson(updated, env().appUrl) });
});
