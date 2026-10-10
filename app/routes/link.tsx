import type { Route } from "./+types/link";
import { LinkApproval } from "../components/LinkApproval";
import { linkPageAction, linkPageLoader } from "../lib/link-page.server";

export function meta() {
  return [{ title: "Link a device" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return linkPageLoader(request, { autoProvider: false });
}

export function action({ request }: Route.ActionArgs) {
  return linkPageAction(request);
}

export default function LinkPage({ loaderData, actionData }: Route.ComponentProps) {
  return <LinkApproval page={actionData ?? loaderData} />;
}
