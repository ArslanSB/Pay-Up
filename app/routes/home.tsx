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
      <p className="display text-2xl">Pay Up</p>
      <h1 className="display text-[56px]">Catch yourself.<br />Pay up.</h1>
      <p className="panel tilt inline-block self-start px-3 py-2 font-semibold">
        Make a jar for the thing you keep doing. Tap it when you do it. Settle up when it hurts.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-extrabold">What Pay Up is</h2>
        <p>
          Pay Up is a free web app for personal accountability: a fine jar for yourself. You create jars for habits you want to break,
          such as negativity or swearing, add a fine to yourself every time you slip, see what you owe, and settle up however you
          choose. It keeps the tally and the history; no money moves through the app.
        </p>
      </section>
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
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-extrabold">What we do with your Google account</h2>
        <p>
          Signing in is how Pay Up knows which jars are yours. With Google it requests only your basic profile through the
          openid, email and profile scopes: your name, your email address and your profile picture. They are used to create your
          account and show your name on your own pages. Pay Up never reads your Gmail, Drive, Contacts or Calendar, never posts
          on your behalf, and never shares or sells your data. GitHub sign-in works the same way. The{" "}
          <Link to="/privacy" className="link">privacy policy</Link> has the details.
        </p>
      </section>
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
