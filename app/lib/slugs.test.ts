import { describe, expect, it } from "vitest";
import { isValidSlug, slugify, withSuffix } from "./slugs";

describe("slugify", () => {
  it.each([
    ["Doom jar", "doom-jar"],
    ["  Negativity   jar!! ", "negativity-jar"],
    ["Café Crème & Co.", "cafe-creme-co"],
    ["Swear_jar v2", "swear-jar-v2"],
    ["---", "jar"],
    ["日本語", "jar"],
    ["ab", "jar"],
  ])("%s -> %s", (title, expected) => {
    expect(slugify(title)).toBe(expected);
  });
  it("cuts long titles at 40 chars without a trailing dash", () => {
    const slug = slugify("this is a very long title that keeps going and going and going");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).not.toMatch(/-$/);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe("isValidSlug", () => {
  it.each(["doom-jar", "abc", "a1-b2", "x".repeat(40)])("accepts %s", (s) => {
    expect(isValidSlug(s)).toBe(true);
  });
  it.each(["ab", "-doom", "doom-", "Doom", "doom jar", "doom_jar", "x".repeat(41), "", "doom--jar"])("rejects %s", (s) => {
    expect(isValidSlug(s)).toBe(false);
  });
});

describe("withSuffix", () => {
  it("appends a dash and the suffix", () => {
    expect(withSuffix("doom-jar", "k7x2")).toBe("doom-jar-k7x2");
  });
  it("trims the base so the result stays within 40 chars", () => {
    const result = withSuffix("x".repeat(40), "k7x2");
    expect(result).toHaveLength(40);
    expect(result.endsWith("-k7x2")).toBe(true);
  });
});
