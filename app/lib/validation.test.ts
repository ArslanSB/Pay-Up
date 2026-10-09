import { describe, expect, it } from "vitest";
import { jarToFormValues, parseJarForm, parseNote } from "./validation";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const good = { title: " Doom jar ", description: "Every gripe", amount: "1,00", currency: "EUR", visibility: "public", slug: "" };

describe("parseJarForm", () => {
  it("accepts and normalises a good form, deriving the slug when the field is empty", () => {
    const result = parseJarForm(form(good));
    expect(result).toEqual({
      ok: true,
      input: { title: "Doom jar", description: "Every gripe", fineAmount: 100, currency: "EUR", visibility: "public", publicSlug: null },
    });
  });
  it("trims and lowercases an explicit slug", () => {
    const result = parseJarForm(form({ ...good, slug: " My-Doom " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.publicSlug).toBe("my-doom");
  });
  it("rejects a malformed slug with the slug message", () => {
    for (const slug of ["ab", "doom jar", "doom_jar", "-doom", "x".repeat(41)]) {
      const result = parseJarForm(form({ ...good, slug }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.slug).toBe("Use 3 to 40 lowercase letters, digits or dashes.");
    }
  });
  it("reports a missing title and echoes values", () => {
    const result = parseJarForm(form({ ...good, title: "  ", slug: "keep-me" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBe("Title is required.");
      expect(result.values.description).toBe("Every gripe");
      expect(result.values.slug).toBe("keep-me");
    }
  });
  it("rejects bad amounts with the amount message (Review Focus 5)", () => {
    for (const amount of ["0", "1.234", "1,000.50", "abc"]) {
      const result = parseJarForm(form({ ...good, amount }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.amount).toBe("Amount must be more than 0.");
    }
  });
  it("rejects unknown currency and visibility, and over-long text", () => {
    const result = parseJarForm(form({ ...good, currency: "XXX", visibility: "friends", title: "x".repeat(61), description: "y".repeat(281) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.currency).toBe("Pick a currency.");
      expect(result.errors.visibility).toBe("Pick private or public.");
      expect(result.errors.title).toBe("Title must be 60 characters or fewer.");
      expect(result.errors.description).toBe("Description must be 280 characters or fewer.");
    }
  });
  it("treats missing fields as empty strings", () => {
    const result = parseJarForm(new FormData());
    expect(result.ok).toBe(false);
  });
});

describe("jarToFormValues", () => {
  it("includes the current slug", () => {
    const values = jarToFormValues({
      id: "j", ownerId: "o", publicSlug: "doom-jar", title: "Doom jar", description: "", fineAmount: 500, currency: "EUR", visibility: "public", createdAt: "", updatedAt: "",
    });
    expect(values).toEqual({ title: "Doom jar", description: "", amount: "5.00", currency: "EUR", visibility: "public", slug: "doom-jar" });
  });
});

describe("parseNote", () => {
  it("trims and nulls whitespace-only notes", () => {
    expect(parseNote(" the weather ")).toEqual({ ok: true, note: "the weather" });
    expect(parseNote("   ")).toEqual({ ok: true, note: null });
    expect(parseNote(null)).toEqual({ ok: true, note: null });
  });
  it("rejects notes over 140 characters", () => {
    expect(parseNote("n".repeat(141))).toEqual({ ok: false, error: "Note must be 140 characters or fewer." });
  });
});
