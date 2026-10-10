import type { Route } from "./+types/api.v1.slugs.$slug";
import { api, apiJson, methodNotAllowed, requireDevice } from "../lib/api.server";
import { getDb } from "../lib/db.server";
import { getJarForOwner, isSlugAvailable } from "../lib/jars.server";
import { isValidSlug } from "../lib/slugs";

/** GET /api/v1/slugs/:slug?jar=<own jar id>: the same advisory check as /api/slug. Saving still enforces uniqueness. */
export const loader = api(async ({ request, params }: Route.LoaderArgs) => {
  const db = getDb();
  const { user } = requireDevice(request, db);
  const slug = params.slug.trim().toLowerCase();
  const jarParam = new URL(request.url).searchParams.get("jar");
  const ownJar = jarParam ? getJarForOwner(db, jarParam, user.id) : null;
  const valid = isValidSlug(slug);
  return apiJson({ slug, valid, available: valid && isSlugAvailable(db, slug, ownJar?.id) });
});

export const action = api(async () => methodNotAllowed(["GET"]));
