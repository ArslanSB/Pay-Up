import { redirect } from "react-router";
import { getDb } from "./db.server";
import type { DeviceKind } from "./devices.server";
import { env } from "./env.server";
import { approveLink, cancelLink, findLink, formatUserCode, normalizeUserCode } from "./links.server";
import { isProvider } from "./oauth.server";
import { getUser, requireUser } from "./session.server";

export type LinkPageState =
  | { state: "signin"; providers: { google: boolean; github: boolean }; appUrl: string; returnTo: string }
  | { state: "enter" }
  | { state: "confirm"; code: string; kind: DeviceKind; name: string }
  | { state: "expired" }
  | { state: "approved"; kind: DeviceKind };

/** /link and /link/phone. With autoProvider, /link/phone?provider=google starts that sign-in straight away. */
export async function linkPageLoader(request: Request, options: { autoProvider: boolean }): Promise<LinkPageState | Response> {
  const url = new URL(request.url);
  const db = getDb();
  const e = env();
  const user = await getUser(request, db);
  if (!user) {
    const returnTo = `${url.pathname}${url.search}`;
    const provider = url.searchParams.get("provider");
    if (options.autoProvider && provider && isProvider(provider) && e[provider]) {
      return redirect(`/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return { state: "signin", providers: { google: Boolean(e.google), github: Boolean(e.github) }, appUrl: e.appUrl, returnTo };
  }
  const raw = url.searchParams.get("code");
  if (raw === null || raw.trim() === "") return { state: "enter" };
  const code = normalizeUserCode(raw);
  const link = code ? findLink(db, code) : null;
  if (!code || !link) return { state: "expired" };
  if (link.approved) return { state: "approved", kind: link.kind };
  return { state: "confirm", code: formatUserCode(code), kind: link.kind, name: link.name };
}

export async function linkPageAction(request: Request): Promise<LinkPageState | Response> {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent !== "approve" && intent !== "cancel") throw new Response("Unknown action.", { status: 400 });
  const code = normalizeUserCode(form.get("code"));
  if (!code) return { state: "expired" };
  if (intent === "cancel") {
    cancelLink(db, code, user.id);
    return redirect("/jars");
  }
  const link = findLink(db, code);
  if (!link) return { state: "expired" };
  if (!link.approved && !approveLink(db, code, user.id)) return { state: "expired" };
  return { state: "approved", kind: link.kind };
}
