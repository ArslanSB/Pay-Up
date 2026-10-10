import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("jars", "routes/jars.tsx"),
  route("jars/new", "routes/jars.new.tsx"),
  route("jars/:id", "routes/jars.$id.tsx"),
  route("jars/:id/edit", "routes/jars.$id.edit.tsx"),
  route("j/:slug", "routes/j.$slug.tsx"),
  route("auth/:provider", "routes/auth.$provider.tsx"),
  route("auth/:provider/callback", "routes/auth.$provider.callback.tsx"),
  route("logout", "routes/logout.tsx"),
  route("api/slug", "routes/api.slug.ts"),
  route("api/v1/links", "routes/api.v1.links.ts"),
  route("api/v1/links/token", "routes/api.v1.links.token.ts"),
  route("api/v1/links/:code", "routes/api.v1.links.$code.ts"),
  route("api/v1/links/:code/approve", "routes/api.v1.links.$code.approve.ts"),
  route("account", "routes/account.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
] satisfies RouteConfig;
