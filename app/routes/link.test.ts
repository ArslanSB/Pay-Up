import { describe, expect, it } from "vitest";
import { getDb } from "../lib/db.server";
import { formatUserCode, pollLink, startLink } from "../lib/links.server";
import { callArgs, catchResponse, formRequest, getRequest, makeUser, sessionCookieFor } from "../test/helpers";
import { loader as phoneLoader } from "./link.phone";
import { action, loader } from "./link";

const ORIGIN = "http://localhost:3000";
function newLink(kind: "phone" | "watch" = "watch") {
  const link = startLink(getDb(), kind, kind === "watch" ? "Pixel Watch 3" : "Pixel 9");
  return { ...link, display: formatUserCode(link.userCode) };
}

describe("/link loader", () => {
  it("asks a signed-out visitor to sign in and come back", async () => {
    const link = newLink();
    const page = await loader(callArgs(getRequest(`${ORIGIN}/link?code=${link.display}`)));
    expect(page).toMatchObject({ state: "signin", returnTo: `/link?code=${link.display}`, providers: { google: true, github: true } });
  });
  it("asks for a code when there is none", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link`, cookie)))).toEqual({ state: "enter" });
  });
  it("shows which device is asking, whatever the code's case or spacing (Review Focus 3)", async () => {
    const link = newLink();
    const cookie = await sessionCookieFor(makeUser().id);
    const sloppy = encodeURIComponent(link.display.toLowerCase().replace("-", " "));
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=${sloppy}`, cookie)))).toEqual({
      state: "confirm",
      code: link.display,
      kind: "watch",
      name: "Pixel Watch 3",
    });
  });
  it("says an unknown or malformed code has expired", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=BBBB-BBBB`, cookie)))).toEqual({ state: "expired" });
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=hello`, cookie)))).toEqual({ state: "expired" });
  });
});

describe("/link/phone loader", () => {
  it("goes straight to the chosen provider and comes back here", async () => {
    const link = newLink("phone");
    const back = `/link/phone?code=${link.display}&provider=github`;
    const response = (await phoneLoader(callArgs(getRequest(`${ORIGIN}${back}`)))) as Response;
    expect(response.headers.get("Location")).toBe(`/auth/github?returnTo=${encodeURIComponent(back)}`);
  });
  it("shows the sign-in buttons for an unknown provider", async () => {
    expect(await phoneLoader(callArgs(getRequest(`${ORIGIN}/link/phone?code=BBBB-BBBB&provider=facebook`)))).toMatchObject({ state: "signin" });
  });
});

describe("/link action", () => {
  it("approves, so the device's next poll gets its token", async () => {
    const user = makeUser();
    const link = newLink();
    const page = await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, await sessionCookieFor(user.id))));
    expect(page).toEqual({ state: "approved", kind: "watch" });
    const result = pollLink(getDb(), link.deviceCode);
    expect(result.status === "approved" && result.user.id).toBe(user.id);
  });
  it("shows the approved page again after a double submit or a reload", async () => {
    const cookie = await sessionCookieFor(makeUser().id);
    const link = newLink();
    await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, cookie)));
    expect(await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, cookie)))).toEqual({ state: "approved", kind: "watch" });
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=${link.display}`, cookie)))).toEqual({ state: "approved", kind: "watch" });
  });
  it("tells a different user that an approved code has expired, in the loader and the action", async () => {
    const link = newLink();
    await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, await sessionCookieFor(makeUser().id))));
    const other = await sessionCookieFor(makeUser().id);
    expect(await loader(callArgs(getRequest(`${ORIGIN}/link?code=${link.display}`, other)))).toEqual({ state: "expired" });
    expect(await action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: link.display }, other)))).toEqual({ state: "expired" });
  });
  it("cancels back to the jars, after which the device gets nothing", async () => {
    const link = newLink();
    const response = (await action(
      callArgs(formRequest(`${ORIGIN}/link`, { intent: "cancel", code: link.display }, await sessionCookieFor(makeUser().id))),
    )) as Response;
    expect(response.headers.get("Location")).toBe("/jars");
    expect(pollLink(getDb(), link.deviceCode)).toEqual({ status: "expired" });
  });
  it("needs a session and a known intent", async () => {
    const signedOut = await catchResponse(action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "approve", code: "BBBB-BBBB" }))));
    expect(signedOut.headers.get("Location")).toBe("/");
    const cookie = await sessionCookieFor(makeUser().id);
    const unknown = await catchResponse(action(callArgs(formRequest(`${ORIGIN}/link`, { intent: "explode", code: newLink().display }, cookie))));
    expect(unknown.status).toBe(400);
  });
});
