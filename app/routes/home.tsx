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
      <header className="grid gap-8 sm:grid-cols-[1.1fr_0.9fr] sm:grid-rows-[auto_auto] sm:gap-x-10">
        <div className="flex flex-col gap-5">
          <p className="display text-2xl">Pay Up</p>
          <h1 className="display text-[56px]">Catch yourself.<br />Pay up.</h1>
          <p className="max-w-[40ch] text-lg font-semibold leading-snug">
            Pay Up is a fine jar for yourself. Make a jar for a habit you want to break, fine yourself every time you slip, and settle up however you like.
          </p>
        </div>
        <div className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <DemoJar />
        </div>
        <div className="flex flex-col gap-4 sm:col-start-1">
          {signInError && <p className="panel bg-pink px-3 py-2 font-semibold">Sign-in didn't complete. Try again.</p>}
          {deleted && <p className="panel bg-mint px-3 py-2 font-semibold">Your account is gone. Thanks for playing.</p>}
          {providers.google && <a href="/auth/google" className="btn btn-ink raised">Continue with Google</a>}
          {providers.github && <a href="/auth/github" className="btn btn-ghost raised">Continue with GitHub</a>}
          {none && <p className="font-semibold">Sign-in isn't set up yet.</p>}
          {!none && (
            <p className="text-sm">
              By continuing you accept the <a href={`${appUrl}/terms`} className="link">terms</a> and the <a href={`${appUrl}/privacy`} className="link">privacy and cookies page</a>.
            </p>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-extrabold">How it works</h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((text, i) => (
            <li key={i} className="flex gap-4 sm:flex-col sm:gap-2">
              <b className="display text-[44px] leading-none">{i + 1}</b>
              <p className="leading-snug">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex max-w-[64ch] flex-col gap-2">
        <h2 className="text-xl font-extrabold">What we do with your Google account</h2>
        <p>
          Signing in is how Pay Up knows which jars are yours. With Google it requests only your basic profile through the openid,
          email and profile scopes: your name, your email address and your profile picture. They are used to create your account and
          show your name on your own pages. Pay Up never reads your Gmail, Drive, Contacts or Calendar, never posts on your behalf,
          and never shares or sells your data. GitHub sign-in works the same way. The <a href={`${appUrl}/privacy`} className="link">privacy policy</a> has the details.
        </p>
      </section>
    </main>
  );
}
