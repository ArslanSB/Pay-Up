import type { Route } from "./+types/api.v1.me";
import { api, apiJson, apiNoContent, methodNotAllowed, requireDevice } from "../lib/api.server";
import { userJson } from "../lib/api-json.server";
import { getDb } from "../lib/db.server";
import { deleteUser } from "../lib/users.server";

export const loader = api(async ({ request }: Route.LoaderArgs) => {
  const { user } = requireDevice(request, getDb());
  return apiJson({ user: userJson(user) });
});

/** DELETE /api/v1/me: erases the account and everything in it, devices included (Play's in-app deletion). */
export const action = api(async ({ request }: Route.ActionArgs) => {
  if (request.method !== "DELETE") return methodNotAllowed(["GET", "DELETE"]);
  const db = getDb();
  const { user } = requireDevice(request, db);
  deleteUser(db, user.id);
  return apiNoContent();
});
