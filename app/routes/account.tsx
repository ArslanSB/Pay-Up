import { data, redirect } from "react-router";
import type { Route } from "./+types/account";
import { getDb } from "../lib/db.server";
import { destroyUserSession, requireUser } from "../lib/session.server";
import { deleteUser } from "../lib/users.server";

export function loader() {
  return redirect("/jars");
}

/** POST intent=delete: erase the account and everything in it, then sign out. */
export async function action({ request }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  if (form.get("intent") !== "delete") return data({ error: "Unknown action." }, { status: 400 });
  deleteUser(db, user.id);
  return destroyUserSession(request, "/?deleted=1");
}
