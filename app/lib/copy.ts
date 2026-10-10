import { dayLabel } from "./dates";
import type { JarSummary } from "./jars.server";
import { formatMoney } from "./money";

export function fineCountLabel(count: number): string {
  return count === 1 ? "1 fine" : `${count} fines`;
}

export function dashboardSubtitle(jars: JarSummary[], locale: string): string {
  if (jars.length === 0) return "No jars yet. Make one for the thing you keep doing.";
  const currencies = new Set(jars.map((j) => j.currency));
  if (currencies.size > 1) return `${jars.length} jars.`;
  const total = jars.reduce((sum, j) => sum + j.unsettledTotal, 0);
  if (total === 0) return "Nothing owed.";
  return `${formatMoney(total, jars[0].currency, locale)} owed. Ouch.`;
}

/** "Last used today", "Last used yesterday", "Last used 6 October". */
export function lastUsedLabel(iso: string, now: Date, timeZone: string, locale: string): string {
  const label = dayLabel(iso, now, timeZone, locale);
  return `Last used ${label === "Today" || label === "Yesterday" ? label.toLowerCase() : label}`;
}
