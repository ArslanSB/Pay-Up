import { data, Link, redirect } from "react-router";
import type { Route } from "./+types/jars.$id.edit";
import { ConfirmButton } from "../components/ConfirmButton";
import { JarForm } from "../components/JarForm";
import { getDb } from "../lib/db.server";
import { env } from "../lib/env.server";
import { notFound } from "../lib/http.server";
import { deleteJar, getJarForOwner, SlugTakenError, updateJar } from "../lib/jars.server";
import { requireUser } from "../lib/session.server";
import { jarFormValues, jarToFormValues, parseJarForm, SLUG_TAKEN_MESSAGE } from "../lib/validation";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `Edit ${loaderData.jar.title}` : "Edit jar" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const jar = getJarForOwner(db, params.id, user.id) ?? notFound();
  return { jar, values: jarToFormValues(jar), slugPrefix: `${env().appUrl}/j/` };
}

export async function action({ request, params }: Route.ActionArgs) {
  const db = getDb();
  const user = await requireUser(request, db);
  const jar = getJarForOwner(db, params.id, user.id) ?? notFound();
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "delete") {
    deleteJar(db, jar.id);
    return redirect("/jars");
  }
  if (intent !== "save") return data({ errors: {}, values: jarFormValues(form) }, { status: 400 });
  const parsed = parseJarForm(form);
  if (!parsed.ok) return data({ errors: parsed.errors, values: parsed.values }, { status: 400 });
  try {
    updateJar(db, jar.id, parsed.input);
    return redirect(`/jars/${jar.id}`);
  } catch (error) {
    if (error instanceof SlugTakenError) return data({ errors: { slug: SLUG_TAKEN_MESSAGE }, values: jarFormValues(form) }, { status: 400 });
    throw error;
  }
}

export default function EditJar({ loaderData, actionData }: Route.ComponentProps) {
  const values = actionData?.values ?? loaderData.values;
  return (
    <main className="flex flex-col gap-6">
      <nav className="flex justify-between font-semibold"><Link to={`/jars/${loaderData.jar.id}`} className="link">‹ {loaderData.jar.title}</Link></nav>
      <h1 className="display text-[46px]">Edit jar</h1>
      <JarForm key={JSON.stringify(values)} values={values} errors={actionData?.errors} submitLabel="Save changes" slugPrefix={loaderData.slugPrefix} jarId={loaderData.jar.id} />
      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Danger</h2>
        <ConfirmButton intent="delete" label="Delete jar" confirmLabel="Yes, delete it" message="This deletes the jar and every fine in it." />
      </section>
    </main>
  );
}
