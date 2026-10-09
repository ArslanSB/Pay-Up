import type { Visibility } from "./jars.server";

export interface FineRow {
  id: string;
  timeLabel: string;
  note: string | null;
  amountLabel: string;
}

export interface DayGroup {
  label: string;
  fines: FineRow[];
}

export interface SettlementRow {
  id: string;
  label: string;
  summary: string;
  totalLabel: string;
}

export interface JarView {
  jar: {
    id: string;
    title: string;
    description: string;
    visibility: Visibility;
    publicSlug: string;
    fineAmountLabel: string;
    currency: string;
  };
  balance: { total: number; count: number };
  balanceLabel: string;
  groups: DayGroup[];
  settlements: SettlementRow[];
  newestFineId: string | null;
}
