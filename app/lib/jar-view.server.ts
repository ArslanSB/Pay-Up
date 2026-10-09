import { fineCountLabel } from "./copy";
import { formatDate, formatTime, groupByDay } from "./dates";
import type { Db } from "./db.server";
import { getBalance, getHistory, type Jar } from "./jars.server";
import { formatMoney } from "./money";
import type { JarView } from "./view-types";

export function buildJarView(db: Db, jar: Jar, opts: { now: Date; timeZone: string; locale: string }): JarView {
  const { now, timeZone, locale } = opts;
  const money = (minor: number) => formatMoney(minor, jar.currency, locale);
  const balance = getBalance(db, jar.id);
  const history = getHistory(db, jar.id);
  return {
    jar: {
      id: jar.id,
      title: jar.title,
      description: jar.description,
      visibility: jar.visibility,
      publicSlug: jar.publicSlug,
      fineAmountLabel: money(jar.fineAmount),
      currency: jar.currency,
    },
    balance,
    balanceLabel: money(balance.total),
    groups: groupByDay(history.unsettled, now, timeZone, locale).map((g) => ({
      label: g.label,
      fines: g.items.map((t) => ({ id: t.id, timeLabel: formatTime(t.createdAt, timeZone, locale), note: t.note, amountLabel: money(t.amount) })),
    })),
    settlements: history.settlements.map((s) => ({
      id: s.id,
      label: `Settled ${formatDate(s.createdAt, now, timeZone, locale)}`,
      summary: s.note ? `${fineCountLabel(s.fineCount)}, ${s.note}` : fineCountLabel(s.fineCount),
      totalLabel: money(s.total),
    })),
    newestFineId: history.unsettled[0]?.id ?? null,
  };
}
