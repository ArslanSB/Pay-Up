import { Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { getUser } from "../lib/session.server";

export function meta() {
  return [
    { title: "Pay Up" },
    {
      name: "description",
      content: "Make a jar for the habit you want to catch. Tap it when you slip, watch the fine pile up, settle when it hurts. Share the damage if you dare.",
    },
  ];
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
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">How it works</h2>
        <ol className="flex flex-col gap-2">
          <li className="panel flex gap-3 px-3 py-3"><b className="display text-2xl">1</b><span>Make a jar for the habit you want to catch, and set the fine per slip.</span></li>
          <li className="panel flex gap-3 px-3 py-3"><b className="display text-2xl">2</b><span>Tap the big pink button every time you catch yourself. Add a note if the moment deserves one.</span></li>
          <li className="panel flex gap-3 px-3 py-3"><b className="display text-2xl">3</b><span>Settle the tally however you like, and share the jar's link if you want witnesses. No money moves through the app.</span></li>
        </ol>
      </section>
      <div className="flex flex-col gap-4">
        {providers.google && <a href="/auth/google" className="btn btn-ink raised">Continue with Google</a>}
        {providers.github && <a href="/auth/github" className="btn btn-ghost raised">Continue with GitHub</a>}
        {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
        {!none && (
          <p className="text-sm">
            Signing in with Google or GitHub is only used to tell your jars apart from everyone else's. We receive your name, avatar and email address, nothing more, and never post on your behalf.
          </p>
        )}
        {!none && (
          <p className="text-sm">
            By continuing you accept the <Link to="/terms" className="link">terms</Link> and the <Link to="/privacy" className="link">privacy and cookies page</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
