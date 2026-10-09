import { Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { getUser } from "../lib/session.server";

export function meta() {
  return [{ title: "Pay Up" }, { name: "description", content: "Catch yourself. Pay up." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request, getDb());
  if (user) return redirect("/jars");
  const e = env();
  return {
    providers: { google: Boolean(e.google), github: Boolean(e.github) },
    signInError: new URL(request.url).searchParams.get("error") === "signin",
    deleted: new URL(request.url).searchParams.get("deleted") === "1",
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { providers, signInError, deleted } = loaderData;
  const none = !providers.google && !providers.github;
  return (
    <main className="flex flex-col gap-6">
      <h1 className="display text-[56px]">Catch yourself.<br />Pay up.</h1>
      <p className="panel tilt inline-block self-start px-3 py-2 font-semibold">
        Make a jar for the thing you keep doing. Tap it when you do it. Settle up when it hurts.
      </p>
      {signInError && <p className="panel bg-pink px-3 py-2 font-semibold">Sign-in didn't complete. Try again.</p>}
      {deleted && <p className="panel bg-mint px-3 py-2 font-semibold">Your account is gone. Thanks for playing.</p>}
      <div className="flex flex-col gap-4">
        {providers.google && <a href="/auth/google" className="btn btn-ink raised">Continue with Google</a>}
        {providers.github && <a href="/auth/github" className="btn btn-ghost raised">Continue with GitHub</a>}
        {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
        {!none && (
          <p className="text-sm">
            By continuing you accept the <Link to="/terms" className="link">terms</Link> and the <Link to="/privacy" className="link">privacy and cookies page</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
