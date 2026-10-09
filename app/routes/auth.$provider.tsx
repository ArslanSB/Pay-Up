import { redirect } from "react-router";
import type { Route } from "./+types/auth.$provider";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { authorizationUrl, generateCodeVerifier, generateState, isProvider, redirectUri } from "../lib/oauth.server";
import { serializeOAuthTransient } from "../lib/session.server";

export async function loader({ params }: Route.LoaderArgs) {
  const provider = params.provider;
  if (!isProvider(provider)) return notFound();
  const e = env();
  const creds = e[provider];
  if (!creds) return notFound();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = authorizationUrl(provider, creds, { redirectUri: redirectUri(e.appUrl, provider), state, codeVerifier });
  return redirect(url.toString(), {
    headers: { "Set-Cookie": await serializeOAuthTransient({ provider, state, codeVerifier }) },
  });
}
