import { data } from "react-router";
import type { Route } from "./+types/api.slug";
import { getDb } from "../lib/db.server";
import { getJarForOwner, isSlugAvailable } from "../lib/jars.server";
import { getUser } from "../lib/session.server";
import { isValidSlug } from "../lib/slugs";

/** GET /api/slug?slug=doom-jar&jar=<own jar id, optional>. Advisory; the form action still enforces uniqueness. */
export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb();
  const user = await getUser(request, db);
  if (!user) return data({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const jarParam = url.searchParams.get("jar");
  const ownJar = jarParam ? getJarForOwner(db, jarParam, user.id) : null;
  const valid = isValidSlug(slug);
  return { slug, valid, available: valid && isSlugAvailable(db, slug, ownJar?.id) };
}
