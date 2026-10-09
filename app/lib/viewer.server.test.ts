import { describe, expect, it } from "vitest";
import { getLocale, getTimeZone, readCookie } from "./viewer.server";

const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

describe("readCookie", () => {
  it("finds a cookie among others and decodes it", () => {
    expect(readCookie("a=1; tz=Europe%2FMadrid; b=2", "tz")).toBe("Europe/Madrid");
  });
  it("returns null when missing", () => {
    expect(readCookie("a=1", "tz")).toBeNull();
    expect(readCookie(null, "tz")).toBeNull();
  });
});

describe("getTimeZone", () => {
  it("accepts a valid zone", () => {
    expect(getTimeZone(req({ Cookie: "tz=Europe/Madrid" }))).toBe("Europe/Madrid");
  });
  it("accepts a legacy alias (Review Focus 1)", () => {
    expect(getTimeZone(req({ Cookie: "tz=Asia/Calcutta" }))).toBe("Asia/Calcutta");
  });
  it("falls back to UTC for junk or missing", () => {
    expect(getTimeZone(req({ Cookie: "tz=Mars/Olympus" }))).toBe("UTC");
    expect(getTimeZone(req({}))).toBe("UTC");
  });
});

describe("getLocale", () => {
  it("picks the first tag by quality", () => {
    expect(getLocale(req({ "Accept-Language": "en-US,en;q=0.9,es;q=0.8" }), "es-ES")).toBe("en-US");
    expect(getLocale(req({ "Accept-Language": "es;q=0.5, en;q=0.9" }), "es-ES")).toBe("en");
  });
  it("canonicalises casing", () => {
    expect(getLocale(req({ "Accept-Language": "EN-us" }), "es-ES")).toBe("en-US");
  });
  it("falls back on wildcard, junk, or missing", () => {
    expect(getLocale(req({ "Accept-Language": "*" }), "es-ES")).toBe("es-ES");
    expect(getLocale(req({ "Accept-Language": "xx-!!" }), "es-ES")).toBe("es-ES");
    expect(getLocale(req({}), "es-ES")).toBe("es-ES");
  });
});
