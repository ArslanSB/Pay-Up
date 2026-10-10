import { Form } from "react-router";
import type { LinkPageState } from "../lib/link-page.server";
import { SignInButtons } from "./SignInButtons";

export function LinkApproval({ page }: { page: LinkPageState }) {
  return <main className="flex flex-col gap-6">{content(page)}</main>;
}

function content(page: LinkPageState) {
  switch (page.state) {
    case "signin":
      return (
        <>
          <h1 className="display text-[46px]">Link a device</h1>
          <p className="font-semibold">Sign in, then confirm the code your phone or watch is showing.</p>
          <div className="flex flex-col gap-4">
            <SignInButtons providers={page.providers} appUrl={page.appUrl} returnTo={page.returnTo} />
          </div>
        </>
      );
    case "enter":
      return (
        <>
          <h1 className="display text-[46px]">Link a device</h1>
          <Form method="get" className="flex flex-col gap-3">
            <label htmlFor="code" className="font-semibold">Code on your device</label>
            <input id="code" name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="WDJB-MJHT" className="panel display tnum w-full px-3 py-3 text-3xl" />
            <button type="submit" className="btn btn-ink raised">Continue</button>
          </Form>
        </>
      );
    case "confirm":
      return (
        <>
          <h1 className="display text-[46px]">Link {page.name} to your Pay Up account?</h1>
          <p className="panel tilt self-start px-4 py-3">
            <span className="block text-sm font-semibold">Your {page.kind} should show</span>
            <b className="display tnum block text-[40px]">{page.code}</b>
          </p>
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="code" value={page.code} />
            <button type="submit" name="intent" value="approve" className="btn btn-pink raised-lg display text-[28px]">Link {page.kind}</button>
            <button type="submit" name="intent" value="cancel" className="btn btn-ghost raised">Cancel</button>
          </Form>
        </>
      );
    case "expired":
      return (
        <>
          <h1 className="display text-[46px]">That code has expired.</h1>
          <p className="font-semibold">Start again on your device.</p>
        </>
      );
    case "approved":
      return page.kind === "watch" ? (
        <>
          <h1 className="display text-[46px]">Linked.</h1>
          <p className="font-semibold">Your watch is ready.</p>
        </>
      ) : (
        <>
          <h1 className="display text-[46px]">Signed in.</h1>
          <a href="payup://linked" className="btn btn-pink raised-lg display text-[28px]">Return to Pay Up</a>
        </>
      );
  }
}
