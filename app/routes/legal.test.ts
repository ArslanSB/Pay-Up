import { describe, expect, it } from "vitest";
import { callArgs, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader as deleteLoader, meta as deleteMeta } from "./delete-account";
import { loader as privacyLoader, meta as privacyMeta } from "./privacy";
import { loader as termsLoader, meta as termsMeta } from "./terms";

describe("legal pages", () => {
  it("expose the operator identity and the date to the page", async () => {
    for (const loader of [termsLoader, privacyLoader]) {
      const data = await loader(callArgs(getRequest("http://localhost:3000/terms")));
      expect(data).toMatchObject({ operatorName: "[operator name not set]", contactEmail: null, appUrl: "http://localhost:3000" });
      expect(data.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("have titles", () => {
    expect(termsMeta()).toContainEqual({ title: "Terms of Service" });
    expect(privacyMeta()).toContainEqual({ title: "Privacy Policy" });
  });
});

describe("root loader", () => {
  it("exposes the operator identity for the footer", async () => {
    const { loader } = await import("../root");
    expect(loader()).toEqual({ operatorName: "[operator name not set]", contactEmail: null });
  });
});

describe("/delete-account", () => {
  it("is public, names the operator and says whether the visitor is signed in", async () => {
    const visitor = await deleteLoader(callArgs(getRequest("http://localhost:3000/delete-account")));
    expect(visitor).toMatchObject({ signedIn: false, providers: { google: true, github: true }, operatorName: "[operator name not set]", appUrl: "http://localhost:3000" });
    expect(visitor.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await deleteLoader(callArgs(getRequest("http://localhost:3000/delete-account", cookie)))).toMatchObject({ signedIn: true });
    expect(deleteMeta()).toContainEqual({ title: "Delete your account" });
  });
});
