import type { ReactNode } from "react";
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import { env } from "./lib/env.server";
import "./app.css";

/** Operator identity for the footer, so every page says who runs the site and how to reach them. */
export function loader() {
  const e = env();
  return { operatorName: e.operatorName, contactEmail: e.contactEmail };
}

const TZ_SCRIPT =
  'try{document.cookie="tz="+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+";path=/;max-age=31536000;samesite=lax"}catch(e){}';

export function Layout({ children }: { children: ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: TZ_SCRIPT }} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#ffd83d" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col bg-yellow font-sans text-ink">
        <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-10 pt-8">{children}</div>
        <footer className="mx-auto w-full max-w-[720px] px-4 pb-10">
          <div className="flex flex-col gap-3 border-t-3 border-ink pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2"><img src="/favicon.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" /><span className="display text-lg">Pay Up</span></span>
              {root && <span>by {root.operatorName}</span>}
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/terms" className="link">Terms of Service</Link>
              <Link to="/privacy" className="link">Privacy Policy</Link>
              {root?.contactEmail && <a href={`mailto:${root.contactEmail}`} className="link">Contact</a>}
            </nav>
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something broke.";
  let detail = "Try again in a moment.";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Nothing here." : `Error ${error.status}`;
    detail = error.status === 404 ? "That jar doesn't exist or isn't public." : String(error.data ?? "");
  }
  return (
    <main className="flex flex-col gap-4">
      <h1 className="display text-[46px]">{title}</h1>
      <p className="font-semibold">{detail}</p>
      <a href="/" className="link">Back to the start</a>
    </main>
  );
}
