import { afterEach, describe, expect, it, vi } from "vitest";
import { assetLinks } from "./assetlinks.server";

const FP = Array.from({ length: 32 }, () => "AB").join(":");

describe("assetLinks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets com.arslansb.payup handle this site's links", async () => {
    const response = assetLinks([FP]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.arslansb.payup", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });
  it("404s until fingerprints are configured", () => {
    expect(assetLinks([]).status).toBe(404);
  });
  it("500s and logs when a configured fingerprint is malformed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = assetLinks(["AB:CD"]);
      expect(response.status).toBe(500);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
