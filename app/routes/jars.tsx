import { Form, Link } from "react-router";
import type { Route } from "./+types/jars";
import { ConfirmButton } from "../components/ConfirmButton";
import { Tile } from "../components/Tile";
import { dashboardSubtitle, fineCountLabel } from "../lib/copy";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { listJarsForOwner } from "../lib/jars.server";
import { formatMoney } from "../lib/money";
import { requireUser } from "../lib/session.server";
import { getLocale } from "../lib/viewer.server";

export function meta() {
  return [{ title: "Your jars" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const locale = getLocale(request, env().appLocale);
  const jars = listJarsForOwner(db, user.id);
  return {
    name: user.name,
    subtitle: dashboardSubtitle(jars, locale),
    jars: jars.map((j) => ({
      id: j.id,
      title: j.title,
      countLabel: fineCountLabel(j.unsettledCount),
      balanceLabel: formatMoney(j.unsettledTotal, j.currency, locale),
    })),
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { subtitle, jars } = loaderData;
  return (
    <main className="flex flex-col gap-6">
      <nav className="flex items-center justify-end gap-5">
        <Link to="/devices" className="link">Devices</Link>
        <Form method="post" action="/logout"><button type="submit" className="link">Sign out</button></Form>
      </nav>
      <div>
        <h1 className="display text-[56px]">Your<br />jars</h1>
        <p className="mt-2 font-semibold">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-[18px]">
        {jars.map((jar, index) => <Tile key={jar.id} jar={jar} index={index} />)}
        <Link to="/jars/new" className={`dashed flex min-h-[168px] items-center justify-center text-center ${jars.length === 0 ? "col-span-2" : ""}`}>
          <h3 className="display text-xl">+ New jar</h3>
        </Link>
      </div>
      <section className="mt-10 flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Account</h2>
        <p className="text-sm">Signed in as {loaderData.name}. Deleting the account removes every jar, fine and settlement in it, and signs out every phone and watch. There is no undo.</p>
        <ConfirmButton action="/account" intent="delete" label="Delete my account" confirmLabel="Yes, delete everything" message="This erases your account and all of its jars. There is no undo." />
      </section>
    </main>
  );
}
