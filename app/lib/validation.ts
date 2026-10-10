import * as z from "zod";
import type { Jar, JarInput } from "./jars.server";
import { amountToInput, CURRENCIES, MAX_MINOR, parseAmount } from "./money";
import { isValidSlug, SLUG_MESSAGE, SLUG_TAKEN_MESSAGE } from "./slugs";

export { SLUG_MESSAGE, SLUG_TAKEN_MESSAGE };

export const AMOUNT_MESSAGE = "Amount must be more than 0.";
const TITLE_MESSAGE = "Title is required.";
const DESCRIPTION_MESSAGE = "Description must be 280 characters or fewer.";

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

// Field rules shared by the web form and the JSON API, so both report the same messages.
const titleField = z.string(TITLE_MESSAGE).trim().min(1, TITLE_MESSAGE).max(60, "Title must be 60 characters or fewer.");
const descriptionField = z.string(DESCRIPTION_MESSAGE).trim().max(280, DESCRIPTION_MESSAGE);
const currencyField = z.enum(CURRENCIES, "Pick a currency.");
const visibilityField = z.enum(["private", "public"], "Pick private or public.");
const slugField = z
  .string(SLUG_MESSAGE)
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || isValidSlug(v), SLUG_MESSAGE);

const jarSchema = z.object({
  title: titleField,
  description: descriptionField,
  amount: z.string().refine((v) => parseAmount(v) !== null, AMOUNT_MESSAGE),
  currency: currencyField,
  visibility: visibilityField,
  slug: slugField,
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

export type JarJsonField = "title" | "description" | "fineAmount" | "currency" | "visibility" | "publicSlug";
export type JarJsonErrors = Partial<Record<JarJsonField, string>>;

const jarJsonSchema = z.object({
  title: titleField,
  description: descriptionField,
  fineAmount: z.number(AMOUNT_MESSAGE).int(AMOUNT_MESSAGE).min(1, AMOUNT_MESSAGE).max(MAX_MINOR, AMOUNT_MESSAGE),
  currency: currencyField,
  visibility: visibilityField,
  publicSlug: slugField,
});

const JSON_FIELDS: JarJsonField[] = ["title", "description", "fineAmount", "currency", "visibility", "publicSlug"];

/** The API's jar body: the form's rules and messages, with the amount as integer minor units. */
export function parseJarJson(body: Record<string, unknown>): { ok: true; input: JarInput } | { ok: false; fields: JarJsonErrors } {
  const result = jarJsonSchema.safeParse({ ...body, description: body.description ?? "", publicSlug: body.publicSlug ?? "" });
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const fields: JarJsonErrors = {};
    for (const field of JSON_FIELDS) {
      const first = fieldErrors[field]?.[0];
      if (first) fields[field] = first;
    }
    return { ok: false, fields };
  }
  const d = result.data;
  return {
    ok: true,
    input: {
      title: d.title,
      description: d.description,
      fineAmount: d.fineAmount,
      currency: d.currency,
      visibility: d.visibility,
      publicSlug: d.publicSlug === "" ? null : d.publicSlug,
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

export function parseNote(raw: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 140) return { ok: false, error: "Note must be 140 characters or fewer." };
  return { ok: true, note: text.length === 0 ? null : text };
}
