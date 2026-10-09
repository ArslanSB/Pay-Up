import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Form, useFetcher } from "react-router";
import { CURRENCIES } from "../lib/money";
import { SLUG_MESSAGE, SLUG_TAKEN_MESSAGE, slugify } from "../lib/slugs";
import type { JarFormErrors, JarFormValues } from "../lib/validation";

interface SlugCheck {
  slug: string;
  valid: boolean;
  available: boolean;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
      {error && <span className="text-sm font-semibold text-blue">{error}</span>}
    </label>
  );
}

export function JarForm({
  values,
  errors,
  submitLabel,
  slugPrefix,
  jarId,
}: {
  values: JarFormValues;
  errors?: JarFormErrors;
  submitLabel: string;
  slugPrefix: string;
  jarId?: string;
}) {
  const editing = Boolean(jarId);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(editing || values.slug !== "");
  const checker = useFetcher<SlugCheck>();
  const timer = useRef<number | undefined>(undefined);

  // On create, the link follows the title until the link is edited by hand.
  function onTitleChange(event: ChangeEvent<HTMLInputElement>) {
    if (slugTouched) return;
    const title = event.target.value;
    setSlug(title.trim() ? slugify(title) : "");
  }

  function onSlugChange(event: ChangeEvent<HTMLInputElement>) {
    setSlugTouched(true);
    setSlug(event.target.value.toLowerCase());
  }

  const load = checker.load;
  useEffect(() => {
    if (slug === "") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const params = new URLSearchParams({ slug });
      if (jarId) params.set("jar", jarId);
      load(`/api/slug?${params.toString()}`);
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [slug, jarId, load]);

  const check = checker.data && checker.data.slug === slug ? checker.data : null;
  let slugStatus: { text: string; bad: boolean } | null = null;
  if (errors?.slug) slugStatus = { text: errors.slug, bad: true };
  else if (slug === "") slugStatus = { text: "Leave it empty and it is made from the title.", bad: false };
  else if (check && !check.valid) slugStatus = { text: SLUG_MESSAGE, bad: true };
  else if (check && !check.available) slugStatus = { text: SLUG_TAKEN_MESSAGE, bad: true };
  else if (check) slugStatus = { text: "Available", bad: false };

  return (
    <Form method="post" className="flex flex-col gap-5">
      <Field label="Title" error={errors?.title}>
        <input name="title" defaultValue={values.title} onChange={onTitleChange} maxLength={60} required className="panel w-full px-3 py-3" />
      </Field>
      <Field label="Description" error={errors?.description}>
        <textarea name="description" defaultValue={values.description} maxLength={280} rows={3} className="panel w-full px-3 py-3" />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Fine per tap" error={errors?.amount}>
          <input name="amount" inputMode="decimal" defaultValue={values.amount} className="panel tnum w-full px-3 py-3" />
        </Field>
        <Field label="Currency" error={errors?.currency}>
          <select name="currency" defaultValue={values.currency || "EUR"} className="panel px-3 py-3">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Who can see it</legend>
        {errors?.visibility && <span className="text-sm font-semibold text-blue">{errors.visibility}</span>}
        <label className="panel flex items-start gap-3 px-3 py-3">
          <input type="radio" name="visibility" value="private" defaultChecked={values.visibility !== "public"} className="mt-1" />
          <span><b className="block">Private</b>Only you.</span>
        </label>
        <label className="panel flex items-start gap-3 px-3 py-3">
          <input type="radio" name="visibility" value="public" defaultChecked={values.visibility === "public"} className="mt-1" />
          <span><b className="block">Public</b>Anyone with the link can see the jar. Only you can add to it.</span>
        </label>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">Public link</span>
        <span className="text-sm text-muted">{slugPrefix}</span>
        <input
          name="slug"
          value={slug}
          onChange={onSlugChange}
          maxLength={40}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="made-from-the-title"
          className="panel w-full px-3 py-3"
        />
        {slugStatus && <span className={`text-sm font-semibold ${slugStatus.bad ? "text-blue" : ""}`}>{slugStatus.text}</span>}
        {editing && <span className="text-sm">Changing it stops the old link working.</span>}
      </label>
      <button type="submit" name="intent" value="save" className="btn btn-ink raised text-xl">{submitLabel}</button>
    </Form>
  );
}
