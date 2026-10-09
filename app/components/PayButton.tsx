import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

export function PayButton({ amountLabel, balanceLabel }: { amountLabel: string; balanceLabel: string }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const formRef = useRef<HTMLFormElement>(null);
  const [pops, setPops] = useState<number[]>([]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);

  function onSubmit() {
    const id = Date.now();
    setPops((p) => [...p, id]);
    setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 700);
  }

  return (
    <fetcher.Form method="post" ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="intent" value="fine" />
      <input name="note" maxLength={140} placeholder="What did you do? (optional)" className="panel w-full px-3 py-3" />
      <div className="relative mb-8">
        <button type="submit" className="btn btn-pink raised-lg display relative w-full py-13 text-[44px]">
          Pay {amountLabel}
          {pops.map((id) => (
            <span key={id} className="pop" aria-hidden="true">+{amountLabel}</span>
          ))}
        </button>
        <span className="sticker panel absolute -bottom-6 right-3 px-3 py-2 text-left text-[17px] font-semibold leading-tight shadow-[4px_4px_0_#000]">
          <span className="block text-[13px]">you owe</span>
          <b className="display tnum block text-2xl">{balanceLabel}</b>
        </span>
      </div>
    </fetcher.Form>
  );
}
