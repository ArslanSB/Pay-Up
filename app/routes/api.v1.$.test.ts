import { describe, expect, it } from "vitest";
import { apiRequest, callArgs } from "../test/helpers";
import { action, loader } from "./api.v1.$";

describe("unknown /api/v1 paths", () => {
  it("answer GET and POST with the JSON 404 shape", async () => {
    const get = await loader(callArgs(apiRequest("http://localhost:3000/api/v1/nope")));
    const post = await action(callArgs(apiRequest("http://localhost:3000/api/v1/nope", { body: {} })));
    for (const response of [get, post]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).error.code).toBe("not_found");
    }
  });
});
