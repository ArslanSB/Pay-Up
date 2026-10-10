import { afterEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "../test/helpers";
import {
  api,
  apiError,
  apiJson,
  apiNoContent,
  clientIp,
  methodNotAllowed,
  optionalStringField,
  readJsonBody,
  requireDevice,
  requireJar,
  slugTakenError,
  validationError,
} from "./api.server";
import { getDb } from "./db.server";
import { createDevice } from "./devices.server";
import { createJar } from "./jars.server";

afterEach(() => vi.restoreAllMocks());

async function thrownBy(fn: () => unknown): Promise<Response> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown Response");
}

const post = (body: string) => new Request("http://localhost:3000/api/v1/x", { method: "POST", body });

describe("responses", () => {
  it("are JSON and never cached", async () => {
    const response = apiJson({ a: 1 }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ a: 1 });
    expect(apiNoContent().status).toBe(204);
    expect(apiNoContent().headers.get("Cache-Control")).toBe("no-store");
  });
  it("shape errors with a code, a message and optional fields", async () => {
    expect(await apiError(404, "not_found", "Gone.").json()).toEqual({ error: { code: "not_found", message: "Gone." } });
    expect(await validationError({ title: "Title is required." }).json()).toEqual({
      error: { code: "validation", message: "Check the highlighted fields.", fields: { title: "Title is required." } },
    });
    const taken = slugTakenError();
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: { code: "slug_taken", message: "That link is taken.", fields: { publicSlug: "That link is taken." } } });
  });
  it("say which methods are allowed", async () => {
    const response = methodNotAllowed(["GET", "DELETE"]);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, DELETE");
    expect((await response.json()).error.code).toBe("method_not_allowed");
  });
});

describe("api wrapper", () => {
  it("returns thrown responses and turns anything else into a logged 500", async () => {
    const thrown = api(async () => {
      throw apiError(401, "unauthorized", "Sign in again.");
    });
    expect((await thrown({})).status).toBe(401);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = api(async () => {
      throw new Error("boom");
    });
    const response = await broken({});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "server_error", message: "Something went wrong." } });
    expect(log).toHaveBeenCalled();
  });
});

describe("requireDevice", () => {
  it("returns the caller for a valid bearer token, whatever the scheme's case", () => {
    const user = makeUser();
    const { device, token } = createDevice(getDb(), user.id, "watch", "W");
    const request = new Request("http://x/", { headers: { Authorization: `bearer ${token}` } });
    expect(requireDevice(request, getDb())).toMatchObject({ device: { id: device.id }, user: { id: user.id } });
  });
  it("throws a 401 otherwise", async () => {
    const cases: Record<string, string>[] = [{}, { Authorization: "Bearer pu_nope" }, { Authorization: "Basic abc" }];
    for (const headers of cases) {
      const response = await thrownBy(() => requireDevice(new Request("http://x/", { headers }), getDb()));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
    }
  });
});

describe("requireJar", () => {
  it("returns the owner's jar and 404s anyone else's", async () => {
    const owner = makeUser();
    const jar = createJar(getDb(), owner.id, { title: "Doom jar", description: "", fineAmount: 100, currency: "EUR", visibility: "private", publicSlug: null });
    expect(requireJar(getDb(), owner.id, jar.id).id).toBe(jar.id);
    const response = await thrownBy(() => requireJar(getDb(), makeUser().id, jar.id));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toEqual({ code: "not_found", message: "That jar doesn't exist." });
  });
});

describe("readJsonBody", () => {
  it("parses a JSON object and treats an empty body as {}", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(post(""))).toEqual({});
  });
  it("rejects arrays, junk, null and bodies over 16 KB with invalid_request", async () => {
    for (const body of ["[1]", "{nope", "null", JSON.stringify({ a: "x".repeat(17 * 1024) })]) {
      const response = await thrownBy(() => readJsonBody(post(body)));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
    }
  });
});

describe("readJsonBody limits", () => {
  it("refuses a Content-Length over 16 KB without reading the body", async () => {
    const request = new Request("http://localhost:3000/api/v1/x", { method: "POST", body: "{}", headers: { "Content-Length": "20000" } });
    const response = await thrownBy(() => readJsonBody(request));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
  it("stops reading a chunked body once it passes 16 KB", async () => {
    let pulled = 0;
    let cancelled = false;
    const chunk = new Uint8Array(8 * 1024).fill(32);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost:3000/api/v1/x", { method: "POST", body, duplex: "half" } as RequestInit);
    const response = await thrownBy(() => readJsonBody(request));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });
});

describe("small helpers", () => {
  it("reads the client address header, or a shared bucket", () => {
    expect(clientIp(new Request("http://x/", { headers: { "x-payup-client-ip": "203.0.113.9" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x/"))).toBe("unknown");
  });
  it("reads optional string fields and rejects other types", async () => {
    expect(optionalStringField({ note: "hi" }, "note")).toBe("hi");
    expect(optionalStringField({ note: null }, "note")).toBeNull();
    expect(optionalStringField({}, "note")).toBeNull();
    const response = await thrownBy(() => optionalStringField({ note: 42 }, "note"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({ code: "invalid_request", message: "note must be a string." });
  });
});
