import { data, Form, Link } from "react-router";
import type { Route } from "./+types/jars.$id";
import { HistoryList } from "../components/HistoryList";
import { PayButton } from "../components/PayButton";
import { ShareLink } from "../components/ShareLink";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { buildJarView } from "../lib/jar-view.server";
import { addFine, deleteFine, getJarForOwner, settle } from "../lib/jars.server";
import { formatMoney } from "../lib/money";
import { requireUser } from "../lib/session.server";
import { parseNote } from "../lib/validation";
import { getLocale, getTimeZone } from "../lib/viewer.server";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? loaderData.view.jar.title : "Jar" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const jar = getJarForOwner(db, params.id, user.id) ?? notFound();
  const e = env();
  const view = buildJarView(db, jar, { now: new Date(), timeZone: getTimeZone(request), locale: getLocale(request, e.appLocale) });
  return { view, publicUrl: `${e.appUrl}/j/${jar.publicSlug}` };
}

export async function action({ request, params }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const jar = getJarForOwner(db, params.id, user.id) ?? notFound();
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "fine") {
    const note = parseNote(form.get("note"));
    if (!note.ok) return data({ ok: false as const, error: note.error }, { status: 400 });
    addFine(db, jar.id, note.note);
    return { ok: true as const, intent: "fine" as const };
  }
  if (intent === "undo") {
    const result = deleteFine(db, jar.id, String(form.get("fineId") ?? ""));
    if (result === "settled") return data({ ok: false as const, error: "That fine is already settled." }, { status: 400 });
    return { ok: true as const, intent: "undo" as const };
  }
  if (intent === "settle") {
    const note = parseNote(form.get("note"));
    if (!note.ok) return data({ ok: false as const, error: note.error }, { status: 400 });
    const settlement = settle(db, jar.id, note.note);
    if (!settlement) return data({ ok: false as const, error: "Nothing to settle yet." }, { status: 400 });
    const locale = getLocale(request, env().appLocale);
    return { ok: true as const, intent: "settle" as const, message: `Settled ${formatMoney(settlement.total, jar.currency, locale)}` };
  }
  return data({ ok: false as const, error: "Unknown action." }, { status: 400 });
}

export default function OwnerJar({ loaderData, actionData }: Route.ComponentProps) {
  const { view, publicUrl } = loaderData;
  const message = actionData && actionData.ok && "message" in actionData ? actionData.message : null;
  const error = actionData && !actionData.ok ? actionData.error : null;
  return (
    <main className="flex flex-col gap-5">
      <nav className="flex justify-between font-semibold">
        <Link to="/jars" className="link">‹ Jars</Link>
        {view.jar.visibility === "public" ? <ShareLink url={publicUrl} /> : <span className="text-sm">Private</span>}
      </nav>
      <h1 className="display text-[46px]">{view.jar.title}</h1>
      {view.jar.description && <p className="panel tilt inline-block self-start px-3 py-2 font-semibold">{view.jar.description}</p>}

      <PayButton amountLabel={view.jar.fineAmountLabel} balanceLabel={view.balanceLabel} />
      {error && <p className="panel bg-pink px-3 py-2 font-semibold">{error}</p>}
      {message && <p className="panel bg-mint px-3 py-2 font-semibold">{message}</p>}

      <HistoryList groups={view.groups} settlements={view.settlements} canEdit newestFineId={view.newestFineId} />

      <Form key={view.settlements.length} method="post" className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="intent" value="settle" />
        <input name="note" maxLength={140} placeholder="Where did it go? (optional)" className="panel w-full px-3 py-3" />
        <button type="submit" disabled={view.balance.count === 0} className="btn btn-ink raised text-[22px]">Settle {view.balanceLabel}</button>
      </Form>
      <Link to={`/jars/${view.jar.id}/edit`} className="btn btn-ghost raised">Edit jar</Link>
    </main>
  );
}
