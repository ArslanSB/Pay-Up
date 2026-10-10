import type { Route } from "./+types/api.v1.jars";
import { api, apiJson, methodNotAllowed, readJsonBody, requireDevice, slugTakenError, validationError } from "../lib/api.server";
import { jarJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { createJar, getJarSummaryForOwner, listJarsForOwner, SlugTakenError } from "../lib/jars.server";
import { parseJarJson } from "../lib/validation";

/** GET /api/v1/jars: the dashboard list, newest first like the web, so tile colors match. */
export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const appUrl = env().appUrl;
  return apiJson({ jars: listJarsForOwner(db, user.id).map((jar) => jarJson(jar, appUrl)) });
});

/** POST /api/v1/jars creates a jar with the web form's rules and messages. */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  const parsed = parseJarJson(await readJsonBody(request));
  if (!parsed.ok) return validationError(parsed.fields);
  try {
    const jar = createJar(db, user.id, parsed.input);
    return apiJson({ jar: jarJson(getJarSummaryForOwner(db, jar.id, user.id)!, env().appUrl) }, 201);
  } catch (error) {
    if (error instanceof SlugTakenError) return slugTakenError();
    throw error;
  }
});
