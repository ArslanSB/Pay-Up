import { redirect } from "react-router";
import type { Route } from "./+types/auth.$provider.callback";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { exchangeCode, fetchProfile, isProvider, OAuthError, redirectUri, safeEqual } from "../lib/oauth.server";
import { clearOAuthTransient, createUserSession, parseOAuthTransient } from "../lib/session.server";
import { upsertUser } from "../lib/users.server";

async function failed(): Promise<Response> {
  return redirect("/?error=signin", { headers: { "Set-Cookie": await clearOAuthTransient() } });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const provider = params.provider;
  if (!isProvider(provider)) return notFound();
  const e = env();
  const creds = e[provider];
  if (!creds) return notFound();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const transient = await parseOAuthTransient(request);
  if (!code || !state || !transient || transient.provider !== provider || !safeEqual(transient.state, state)) {
    return failed();
  }

  try {
    const token = await exchangeCode(provider, creds, { redirectUri: redirectUri(e.appUrl, provider), code, codeVerifier: transient.codeVerifier });
    const profile = await fetchProfile(provider, token);
    const user = upsertUser(getDb(), { provider, ...profile });
    const response = await createUserSession(user.id, "/jars");
    response.headers.append("Set-Cookie", await clearOAuthTransient());
    return response;
  } catch (error) {
    // Any failure past this point is a sign-in that did not complete; show the sign-in message, keep the detail in the log.
    if (error instanceof OAuthError) console.warn(`[auth] ${provider} sign-in failed: ${error.code}`);
    else console.error(`[auth] ${provider} sign-in failed unexpectedly`, error);
    return failed();
  }
}
