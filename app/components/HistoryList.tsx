import { Fragment } from "react";
import { useFetcher } from "react-router";
import type { DayGroup, SettlementRow } from "../lib/view-types";

function FineDelete({ fineId, label }: { fineId: string; label: string }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" className="col-start-2 col-end-4">
      <input type="hidden" name="intent" value="undo" />
      <input type="hidden" name="fineId" value={fineId} />
      <button type="submit" className="link text-sm text-blue">{label}</button>
    </fetcher.Form>
  );
}

export function HistoryList({ groups, settlements, canEdit, newestFineId }: {
  groups: DayGroup[];
  settlements: SettlementRow[];
  canEdit: boolean;
  newestFineId: string | null;
}) {
  if (groups.length === 0 && settlements.length === 0) {
    return <p className="font-semibold">Nothing in the jar yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Fragment key={group.label}>
          <p className="mt-2 text-sm font-semibold">{group.label}</p>
          {group.fines.map((fine) => (
            <div key={fine.id} className="panel grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3">
              <time className="tnum font-extrabold">{fine.timeLabel}</time>
              <span className={fine.note ? "" : "text-muted"}>{fine.note ?? "no note"}</span>
              <b className="tnum">{fine.amountLabel}</b>
              {canEdit && <FineDelete fineId={fine.id} label={fine.id === newestFineId ? "Undo" : "Delete"} />}
            </div>
          ))}
        </Fragment>
      ))}
      {settlements.map((s) => (
        <Fragment key={s.id}>
          <p className="mt-2 text-sm font-semibold">{s.label}</p>
          <div className="panel flex justify-between gap-3 bg-mint px-3.5 py-3 font-semibold">
            <span>{s.summary}</span>
            <b className="tnum">{s.totalLabel}</b>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
