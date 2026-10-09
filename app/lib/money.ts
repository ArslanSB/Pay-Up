export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN"] as const;
export type Currency = (typeof CURRENCIES)[number];

const MAX_MINOR = 100_000_000; // 1,000,000.00

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** "1", "1,5", "1.50" -> minor units. Anything else -> null. */
export function parseAmount(input: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  const minor = whole * 100 + fraction;
  if (minor <= 0 || minor > MAX_MINOR) return null;
  return minor;
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

export function amountToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}
