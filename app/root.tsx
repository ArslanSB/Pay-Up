import type { ReactNode } from "react";
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

const TZ_SCRIPT =
  'try{document.cookie="tz="+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+";path=/;max-age=31536000;samesite=lax"}catch(e){}';

export function Layout({ children }: { children: ReactNode }) {
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
        <footer className="mx-auto flex w-full max-w-[720px] gap-5 px-4 pb-10 text-sm">
          <Link to="/terms" className="link">Terms</Link>
          <Link to="/privacy" className="link">Privacy and cookies</Link>
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
