import type { ReactNode } from "react";
import { Link } from "react-router";

export interface LegalData {
  operatorName: string;
  contactEmail: string | null;
  appUrl: string;
  updated: string;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

export function LegalPage({ title, data, children }: { title: string; data: LegalData; children: ReactNode }) {
  return (
    <main className="flex flex-col gap-6 leading-relaxed">
      <nav className="flex justify-between font-semibold"><Link to="/" className="link">‹ Pay Up</Link></nav>
      <div>
        <h1 className="display text-[46px]">{title}</h1>
        <p className="mt-2 text-sm font-semibold">Updated {data.updated}</p>
      </div>
      <p className="panel px-3 py-2 font-semibold">
        Run by {data.operatorName}.{" "}
        {data.contactEmail ? (
          <>Contact: <a href={`mailto:${data.contactEmail}`} className="link">{data.contactEmail}</a>.</>
        ) : (
          <>Contact details are not configured yet.</>
        )}
      </p>
      {children}
    </main>
  );
}
