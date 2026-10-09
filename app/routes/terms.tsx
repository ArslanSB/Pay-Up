import { Link } from "react-router";
import type { Route } from "./+types/terms";
import { LegalPage, Section } from "../components/LegalPage";
import { env } from "../lib/env.server";

const UPDATED = "2026-10-09";

export function meta() {
  return [{ title: "Terms of use" }];
}

export function loader({}: Route.LoaderArgs) {
  const e = env();
  return { operatorName: e.operatorName, contactEmail: e.contactEmail, appUrl: e.appUrl, updated: UPDATED };
}

export default function Terms({ loaderData }: Route.ComponentProps) {
  return (
    <LegalPage title="Terms of use" data={loaderData}>
      <Section title="1. What Pay Up is">
        <p>Pay Up is a personal accountability tally. You make jars for habits you want to catch, add a fine to yourself each time you do the thing, and settle the balance however you choose. No money moves through the service; the amounts are numbers you keep for yourself. Nothing here is financial, legal, medical or psychological advice.</p>
      </Section>
      <Section title="2. Your account">
        <p>You sign in with a Google or GitHub account; we never see your password. You are responsible for what happens under your account while you are signed in. You must be 16 or older to use the service.</p>
      </Section>
      <Section title="3. Your content">
        <p>Jar titles, descriptions, notes and amounts are yours. You give us permission to store and display them as needed to run the service, including on public links you choose to create. Do not add other people's personal data, unlawful content, or anything meant to harass or deceive. We may remove content or close accounts that break these rules.</p>
      </Section>
      <Section title="4. Public links">
        <p>Each jar is private unless you make it public. Anyone with a public link can see that jar's title, description, balance and full history, notes included. You can change the link or make the jar private at any time, but copies people already took are out of our hands.</p>
      </Section>
      <Section title="5. Availability and changes">
        <p>The service is provided as is. It may be unavailable, change, or stop altogether; we will try to say so on the site in advance. We do not guarantee against data loss. Keep your own record of anything that matters to you.</p>
      </Section>
      <Section title="6. Liability">
        <p>To the extent the law allows, we are not liable for losses that come from using or not being able to use the service, including any money you decide to pay yourself or anyone else. Your statutory consumer rights are not affected.</p>
      </Section>
      <Section title="7. Ending things">
        <p>You can delete your account from the dashboard at any time, which erases everything in it. We may suspend or delete accounts that abuse the service, and may remove long-inactive accounts after trying to give notice.</p>
      </Section>
      <Section title="8. Law and changes">
        <p>These terms are governed by Spanish law. If you are a consumer in the European Union, you can bring claims in the courts of the country where you live. We may update these terms; the date at the top tells you when, and using the service after a change means you accept it. Our <Link to="/privacy" className="link">privacy and cookies page</Link> explains what we store.</p>
      </Section>
    </LegalPage>
  );
}
