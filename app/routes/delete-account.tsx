import { Link } from "react-router";
import type { Route } from "./+types/delete-account";
import { LegalPage, Section } from "../components/LegalPage";
import { SignInButtons } from "../components/SignInButtons";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { getUser } from "../lib/session.server";

const UPDATED = "2026-10-10";

export function meta() {
  return [{ title: "Delete your account" }];
}

/** Public: Google Play's Data safety form links here so people can delete without reinstalling the app. */
export async function loader({ request }: Route.LoaderArgs) {
  const e = env();
  const user = await getUser(request, getDb());
  return {
    operatorName: e.operatorName,
    contactEmail: e.contactEmail,
    appUrl: e.appUrl,
    updated: UPDATED,
    signedIn: Boolean(user),
    providers: { google: Boolean(e.google), github: Boolean(e.github) },
  };
}

export default function DeleteAccount({ loaderData }: Route.ComponentProps) {
  const { signedIn, providers, appUrl } = loaderData;
  return (
    <LegalPage title="Delete your account" data={loaderData}>
      <Section title="What goes">
        <p>Your account and everything in it: every jar, fine and settle-up, and every phone and watch signed in to it. Public links stop working. It happens straight away and there is no undo.</p>
      </Section>
      {signedIn ? (
        <Section title="Delete it">
          <p>Open your jars, scroll to Account and choose Delete my account. The phone app has the same button under Account.</p>
          <Link to="/jars" className="btn btn-ink raised self-start">Open your jars</Link>
        </Section>
      ) : (
        <Section title="Sign in to delete">
          <p>Sign in with the account you want gone. You land on your jars; scroll to Account and choose Delete my account.</p>
          <div className="flex flex-col gap-4">
            <SignInButtons providers={providers} appUrl={appUrl} returnTo="/jars" />
          </div>
        </Section>
      )}
      <Section title="Can't sign in?">
        <p>Write to the contact address above from the email on your account, and the operator will delete it for you.</p>
      </Section>
    </LegalPage>
  );
}
