import { describe, expect, it } from "vitest";
import { readEnv } from "./env.server";

const base = {
  SESSION_SECRET: "0123456789abcdef0123",
  APP_URL: "https://jars.example.com/",
};

describe("readEnv", () => {
  it("requires a long SESSION_SECRET", () => {
    expect(() => readEnv({ ...base, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => readEnv({ APP_URL: base.APP_URL })).toThrow(/SESSION_SECRET/);
  });
  it("requires APP_URL and strips a trailing slash", () => {
    expect(() => readEnv({ SESSION_SECRET: base.SESSION_SECRET })).toThrow(/APP_URL/);
    expect(readEnv(base).appUrl).toBe("https://jars.example.com");
  });
  it("applies defaults and leaves unconfigured providers null", () => {
    const e = readEnv(base);
    expect(e.databasePath).toBe("./data/payup.db");
    expect(e.appLocale).toBe("es-ES");
    expect(e.google).toBeNull();
    expect(e.github).toBeNull();
    expect(e.isProduction).toBe(false);
  });
  it("reads provider pairs only when both halves exist", () => {
    const e = readEnv({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "sec", GITHUB_CLIENT_ID: "only-id" });
    expect(e.google).toEqual({ clientId: "id", clientSecret: "sec" });
    expect(e.github).toBeNull();
  });
});

describe("readEnv: operator identity for the legal pages", () => {
  it("defaults to placeholders that make the gap visible", () => {
    const e = readEnv(base);
    expect(e.operatorName).toBe("[operator name not set]");
    expect(e.contactEmail).toBeNull();
  });
  it("reads OPERATOR_NAME and CONTACT_EMAIL", () => {
    const e = readEnv({ ...base, OPERATOR_NAME: "Arslan Sohail", CONTACT_EMAIL: "hello@example.com" });
    expect(e.operatorName).toBe("Arslan Sohail");
    expect(e.contactEmail).toBe("hello@example.com");
  });
});

describe("readEnv: Android App Links", () => {
  const fp = Array.from({ length: 32 }, () => "ab").join(":");
  it("defaults to no fingerprints", () => {
    expect(readEnv(base).androidCertFingerprints).toEqual([]);
  });
  it("reads comma-separated fingerprints, uppercased", () => {
    expect(readEnv({ ...base, ANDROID_CERT_FINGERPRINTS: ` ${fp} , ${fp.toUpperCase()} ` }).androidCertFingerprints).toEqual([fp.toUpperCase(), fp.toUpperCase()]);
  });
  it("refuses anything that is not a SHA-256 fingerprint", () => {
    expect(() => readEnv({ ...base, ANDROID_CERT_FINGERPRINTS: "AB:CD" })).toThrow(/ANDROID_CERT_FINGERPRINTS/);
  });
});
