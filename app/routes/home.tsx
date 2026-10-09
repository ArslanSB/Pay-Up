import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { DemoJar } from "../components/DemoJar";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { getUser } from "../lib/session.server";

export function meta({ loaderData }: Route.MetaArgs) {
  const appUrl = loaderData?.appUrl ?? "";
  return [
    { title: "Pay Up" },
    {
      name: "description",
      content: "Make a jar for the habit you want to catch. Tap it when you slip, watch the fine pile up, settle when it hurts. Share the damage if you dare.",
    },
    { tagName: "link", rel: "privacy-policy", href: `${appUrl}/privacy` },
    { tagName: "link", rel: "terms-of-service", href: `${appUrl}/terms` },
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
    appUrl: e.appUrl,
  };
}

const STEPS = [
  "Make a jar for the habit you want to catch, and set the fine per slip.",
  "Tap the big pink button every time you catch yourself. Add a note if the moment deserves one.",
  "Settle the tally however you like, and share the jar's link if you want witnesses. No money moves through the app.",
];

export default function Home({ loaderData }: Route.ComponentProps) {
  const { providers, signInError, deleted, appUrl } = loaderData;
  const none = !providers.google && !providers.github;
  return (
    <main className="flex flex-col gap-12">
      <header className="grid gap-8 sm:grid-cols-[1.1fr_0.9fr] sm:grid-rows-[auto_auto] sm:gap-x-10 sm:gap-y-12">
        <div className="flex flex-col gap-5">
          <p className="display text-2xl">Pay Up</p>
          <h1 className="display text-[56px]">Catch yourself.<br />Pay up.</h1>
          <p className="max-w-[40ch] text-lg font-semibold leading-snug">
            Pay Up is a fine jar for yourself. Make a jar for a habit you want to break, fine yourself every time you slip, and settle up however you like.
          </p>
        </div>
        <div className="sm:col-start-2 sm:row-start-1">
          <DemoJar />
        </div>
        <div className="flex flex-col gap-4 sm:col-start-1 sm:row-start-2">
          {signInError && <p className="panel bg-pink px-3 py-2 font-semibold">Sign-in didn't complete. Try again.</p>}
          {deleted && <p className="panel bg-mint px-3 py-2 font-semibold">Your account is gone. Thanks for playing.</p>}
          {providers.google && <a href="/auth/google" className="btn btn-ink raised">Continue with Google</a>}
          {providers.github && <a href="/auth/github" className="btn btn-ghost raised">Continue with GitHub</a>}
          {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
          {!none && (
            <p className="max-w-[46ch] text-sm leading-snug">
              By continuing you accept the <a href={`${appUrl}/terms`} className="link">terms</a> and the{" "}
              <a href={`${appUrl}/privacy`} className="link">privacy and cookies page</a>, and authorise Pay Up to receive your Google or
              GitHub account name, email address and profile picture. Pay Up uses them solely to create your account, keep you signed in and
              show your name on your own pages. It does not request, access or store any other data from your account, and never posts on
              your behalf.
            </p>
          )}
        </div>
        <section className="flex flex-col gap-4 sm:col-start-2 sm:row-start-2">
          <h2 className="text-xl font-extrabold">How it works</h2>
          <ol className="flex flex-col gap-4">
            {STEPS.map((text, i) => (
              <li key={i} className="flex gap-4">
                <b className="display w-8 shrink-0 text-[40px] leading-none">{i + 1}</b>
                <p className="leading-snug">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </header>
    </main>
  );
}
