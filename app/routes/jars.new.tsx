import { data, Link, redirect } from "react-router";
import type { Route } from "./+types/jars.new";
import { JarForm } from "../components/JarForm";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { createJar, SlugTakenError } from "../lib/jars.server";
import { requireUser } from "../lib/session.server";
import { jarFormValues, parseJarForm, SLUG_TAKEN_MESSAGE, type JarFormValues } from "../lib/validation";

const EMPTY: JarFormValues = { title: "", description: "", amount: "1.00", currency: "EUR", visibility: "private", slug: "" };

export function meta() {
  return [{ title: "New jar" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, getDb());
  return { slugPrefix: `${env().appUrl}/j/` };
}

export async function action({ request }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const form = await request.formData();
  const parsed = parseJarForm(form);
  if (!parsed.ok) return data({ errors: parsed.errors, values: parsed.values }, { status: 400 });
  try {
    const jar = createJar(db, user.id, parsed.input);
    return redirect(`/jars/${jar.id}`);
  } catch (error) {
    if (error instanceof SlugTakenError) return data({ errors: { slug: SLUG_TAKEN_MESSAGE }, values: jarFormValues(form) }, { status: 400 });
    throw error;
  }
}

export default function NewJar({ loaderData, actionData }: Route.ComponentProps) {
  const values = actionData?.values ?? EMPTY;
  return (
    <main className="flex flex-col gap-6">
      <nav className="flex justify-between font-semibold"><Link to="/jars" className="link">‹ Jars</Link></nav>
      <h1 className="display text-[46px]">New jar</h1>
      <JarForm key={JSON.stringify(values)} values={values} errors={actionData?.errors} submitLabel="Make the jar" slugPrefix={loaderData.slugPrefix} />
    </main>
  );
}
