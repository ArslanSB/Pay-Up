import { Link } from "react-router";
import type { Route } from "./+types/j.$slug";
import { HistoryList } from "../components/HistoryList";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { buildJarView } from "../lib/jar-view.server";
import { getPublicJarBySlug } from "../lib/jars.server";
import { getUser } from "../lib/session.server";
import { getLocale, getTimeZone } from "../lib/viewer.server";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Pay Up" }];
  const { title, description } = loaderData.view.jar;
  const text = description || `${loaderData.view.balanceLabel} owed so far.`;
  return [
    { title },
    { name: "description", content: text },
    { property: "og:title", content: title },
    { property: "og:description", content: text },
    { property: "og:type", content: "website" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = getDb();
  const jar = getPublicJarBySlug(db, params.slug) ?? notFound();
  const user = await getUser(request, db);
  const view = buildJarView(db, jar, { now: new Date(), timeZone: getTimeZone(request), locale: getLocale(request, env().appLocale) });
  return { view, isOwner: user?.id === jar.ownerId };
}

export default function PublicJar({ loaderData }: Route.ComponentProps) {
  const { view, isOwner } = loaderData;
  return (
    <main className="flex flex-col gap-5">
      <nav className="flex justify-between font-semibold">
        <span className="text-sm">Pay Up</span>
        {isOwner && <Link to={`/jars/${view.jar.id}`} className="link">Manage</Link>}
      </nav>
      <h1 className="display text-[46px]">{view.jar.title}</h1>
      {view.jar.description && <p className="panel tilt inline-block self-start px-3 py-2 font-semibold">{view.jar.description}</p>}
      <div className="panel raised flex items-end justify-between bg-pink p-4">
        <span className="font-semibold">owes</span>
        <b className="display tnum text-[44px]">{view.balanceLabel}</b>
      </div>
      <HistoryList groups={view.groups} settlements={view.settlements} canEdit={false} newestFineId={null} />
    </main>
  );
}
