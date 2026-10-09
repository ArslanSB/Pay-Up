import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroyUserSession } from "../lib/session.server";

export function loader() {
  return redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  return destroyUserSession(request, "/");
}
