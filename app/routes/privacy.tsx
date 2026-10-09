import { Link } from "react-router";
import type { Route } from "./+types/privacy";
import { LegalPage, Section } from "../components/LegalPage";
import { env } from "../lib/env.server";

const UPDATED = "2026-10-09";

export function meta() {
  return [{ title: "Privacy and cookies" }];
}

export function loader({}: Route.LoaderArgs) {
  const e = env();
  return { operatorName: e.operatorName, contactEmail: e.contactEmail, appUrl: e.appUrl, updated: UPDATED };
}

const COOKIES = [
  { name: "__session", purpose: "Keeps you signed in.", kind: "Essential", lifetime: "30 days" },
  { name: "__oauth", purpose: "Completes a sign-in you started.", kind: "Essential", lifetime: "10 minutes" },
  { name: "tz", purpose: "Shows times in your timezone.", kind: "Functional", lifetime: "1 year" },
];

export default function Privacy({ loaderData }: Route.ComponentProps) {
  return (
    <LegalPage title="Privacy and cookies" data={loaderData}>
      <Section title="1. Who is responsible">
        <p>The person named above runs this deployment of Pay Up and is the data controller. Write to the contact address for anything about your data.</p>
      </Section>
      <Section title="2. What we store">
        <p><b>Account.</b> Which provider you signed in with (Google or GitHub), the ID that provider gives us for you, your display name, your avatar address, and your email address if the provider shares a verified one. We never receive your password.</p>
        <p><b>Content.</b> Your jars (title, description, fine amount, currency, visibility, public link), the fines you add (time, amount, optional note) and your settle-ups (total, optional note).</p>
        <p><b>Technical.</b> The server keeps ordinary request logs (IP address, browser, pages requested, time) for a short period, for security and troubleshooting. There are no analytics, no advertising trackers and no profiling.</p>
      </Section>
      <Section title="3. Why, and on what basis">
        <p>To provide the service you asked for when you signed in, which is the contract between us, and to keep it secure, which is our legitimate interest. We do not use your data for marketing, do not sell it, and do not share it with anyone except the hosting provider that runs the server and, during sign-in only, Google or GitHub.</p>
      </Section>
      <Section title="4. Cookies">
        <p>The site sets three cookies, none of them for tracking, which is why there is no cookie banner: nothing here needs your consent.</p>
        <div className="panel overflow-hidden">
          {COOKIES.map((c) => (
            <div key={c.name} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b-3 border-ink px-3 py-2 last:border-b-0">
              <code className="font-extrabold">{c.name}</code>
              <span>{c.purpose}</span>
              <span className="text-sm">{c.kind}</span>
              <span className="text-sm">{c.lifetime}</span>
            </div>
          ))}
        </div>
        <p>Google and GitHub set their own cookies on their own sites while you sign in; their policies cover those.</p>
      </Section>
      <Section title="5. Public jars">
        <p>If you make a jar public, anyone with its link can see the title, description, balance, fine times and notes. Search engines can index it if someone links to it. Private jars are visible only to you while signed in. Think before putting other people's names in notes on a public jar.</p>
      </Section>
      <Section title="6. How long we keep it">
        <p>Until you delete the jar or your account. Deleting your account from the dashboard erases the account, its jars, fines and settlements immediately. Server backups, where the hosting provider keeps them, can hold a copy for up to 30 days afterwards.</p>
      </Section>
      <Section title="7. Your rights">
        <p>You can ask to see, correct, export or erase your data, to restrict or object to how it is used, and you can delete your account yourself from the dashboard. Email the contact address for the rest. You can also complain to the Spanish data protection authority (AEPD) or to the authority in your own country.</p>
      </Section>
      <Section title="8. Where it lives, and security">
        <p>Your data is stored on the server the operator runs this site from; ask if you need to know where it is hosted. The site uses HTTPS and signed cookies, and only the operator can reach the database. No system is perfectly secure.</p>
      </Section>
      <Section title="9. Children and changes">
        <p>The service is for people aged 16 and over. We may update this page; the date at the top tells you when. The <Link to="/terms" className="link">terms of use</Link> cover the rest.</p>
      </Section>
    </LegalPage>
  );
}
