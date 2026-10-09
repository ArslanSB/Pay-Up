import { describe, expect, it } from "vitest";
import { callArgs, getRequest } from "../test/helpers";
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
    expect(termsMeta()).toContainEqual({ title: "Terms of use" });
    expect(privacyMeta()).toContainEqual({ title: "Privacy and cookies" });
  });
});
