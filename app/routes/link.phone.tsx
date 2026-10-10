import type { Route } from "./+types/link.phone";
import { LinkApproval } from "../components/LinkApproval";
import { linkPageAction, linkPageLoader } from "../lib/link-page.server";

export function meta() {
  return [{ title: "Sign in to Pay Up" }];
}

/** The phone app's own sign-in. A separate path from /link, so the app's App Link never captures it (spec 5.2). */
export function loader({ request }: Route.LoaderArgs) {
  return linkPageLoader(request, { autoProvider: true });
}

export function action({ request }: Route.ActionArgs) {
  return linkPageAction(request);
}

export default function PhoneLinkPage({ loaderData, actionData }: Route.ComponentProps) {
  return <LinkApproval page={actionData ?? loaderData} />;
}
