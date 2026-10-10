import { data, Link } from "react-router";
import type { Route } from "./+types/devices";
import { ConfirmButton } from "../components/ConfirmButton";
import { lastUsedLabel } from "../lib/copy";
import { formatDate } from "../lib/dates";
import { getDb } from "../lib/db.server";
import { listDevices, revokeDevice } from "../lib/devices.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { requireUser } from "../lib/session.server";
import { getLocale, getTimeZone } from "../lib/viewer.server";

export function meta() {
  return [{ title: "Devices" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const now = new Date();
  const timeZone = getTimeZone(request);
  const locale = getLocale(request, env().appLocale);
  return {
    devices: listDevices(db, user.id).map((d) => ({
      id: d.id,
      name: d.name,
      kindLabel: d.kind === "phone" ? "Phone" : "Watch",
      addedLabel: `Added ${formatDate(d.createdAt, now, timeZone, locale)}`,
      usedLabel: lastUsedLabel(d.lastUsedAt, now, timeZone, locale),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  if (form.get("intent") !== "revoke") return data({ ok: false as const, error: "Unknown action." }, { status: 400 });
  if (!revokeDevice(db, user.id, String(form.get("deviceId") ?? ""))) notFound();
  return { ok: true as const };
}

export default function Devices({ loaderData }: Route.ComponentProps) {
  const { devices } = loaderData;
  return (
    <main className="flex flex-col gap-6">
      <nav className="flex justify-between font-semibold"><Link to="/jars" className="link">‹ Jars</Link></nav>
      <h1 className="display text-[46px]">Devices</h1>
      {devices.length === 0 ? (
        <p className="font-semibold">No phones or watches yet. Get Pay Up on Google Play.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => (
            <li key={d.id} className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="display text-2xl">{d.name}</h2>
                <p className="text-sm font-semibold">{d.kindLabel}. {d.addedLabel}. {d.usedLabel}.</p>
              </div>
              <ConfirmButton intent="revoke" fields={{ deviceId: d.id }} label="Revoke" confirmLabel="Revoke" message={`Revoke ${d.name}? It will be signed out.`} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
