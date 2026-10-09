import * as z from "zod";
import type { Jar, JarInput } from "./jars.server";
import { amountToInput, CURRENCIES, parseAmount } from "./money";
import { isValidSlug, SLUG_MESSAGE, SLUG_TAKEN_MESSAGE } from "./slugs";

export { SLUG_MESSAGE, SLUG_TAKEN_MESSAGE };

export type JarField = "title" | "description" | "amount" | "currency" | "visibility" | "slug";
export type JarFormErrors = Partial<Record<JarField, string>>;
export interface JarFormValues {
  title: string;
  description: string;
  amount: string;
  currency: string;
  visibility: string;
  slug: string;
}

const jarSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(60, "Title must be 60 characters or fewer."),
  description: z.string().trim().max(280, "Description must be 280 characters or fewer."),
  amount: z.string().refine((v) => parseAmount(v) !== null, "Amount must be more than 0."),
  currency: z.enum(CURRENCIES, "Pick a currency."),
  visibility: z.enum(["private", "public"], "Pick private or public."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || isValidSlug(v), SLUG_MESSAGE),
});

const FIELDS: JarField[] = ["title", "description", "amount", "currency", "visibility", "slug"];

export function jarFormValues(form: FormData): JarFormValues {
  const read = (k: JarField) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    title: read("title"),
    description: read("description"),
    amount: read("amount"),
    currency: read("currency"),
    visibility: read("visibility"),
    slug: read("slug"),
  };
}

export function parseJarForm(form: FormData): { ok: true; input: JarInput } | { ok: false; errors: JarFormErrors; values: JarFormValues } {
  const values = jarFormValues(form);
  const result = jarSchema.safeParse(values);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const errors: JarFormErrors = {};
    for (const field of FIELDS) {
      const first = fieldErrors[field]?.[0];
      if (first) errors[field] = first;
    }
    return { ok: false, errors, values };
  }
  const d = result.data;
  return {
    ok: true,
    input: {
      title: d.title,
      description: d.description,
      fineAmount: parseAmount(d.amount) as number,
      currency: d.currency,
      visibility: d.visibility,
      publicSlug: d.slug === "" ? null : d.slug,
    },
  };
}

export function jarToFormValues(jar: Jar): JarFormValues {
  return {
    title: jar.title,
    description: jar.description,
    amount: amountToInput(jar.fineAmount),
    currency: jar.currency,
    visibility: jar.visibility,
    slug: jar.publicSlug,
  };
}

export function parseNote(raw: FormDataEntryValue | null): { ok: true; note: string | null } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 140) return { ok: false, error: "Note must be 140 characters or fewer." };
  return { ok: true, note: text.length === 0 ? null : text };
}
