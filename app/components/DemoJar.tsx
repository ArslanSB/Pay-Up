import { useState } from "react";

const AMOUNT = 5;

/** A tap-able replica of a jar's pay button. Keeps nothing; it exists so the landing page shows the product instead of describing it. */
export function DemoJar() {
  const [count, setCount] = useState(0);
  const [pops, setPops] = useState<number[]>([]);

  function pay() {
    setCount((c) => c + 1);
    const id = Date.now() + Math.random();
    setPops((p) => [...p, id]);
    setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 700);
  }

  return (
    <div className="relative flex flex-col gap-3 pt-3">
      <span className="sticker panel absolute -top-1 right-0 px-2 py-1 text-xs font-extrabold" aria-hidden="true">Demo</span>
      <p className="display text-2xl">Doom jar</p>
      <p className="panel tilt inline-block self-start px-3 py-2 text-sm font-semibold">Any forecast of failure is 5 €. Thoughts count.</p>
      <div className="relative mb-8">
        <button type="button" onClick={pay} className="btn btn-pink raised-lg display relative w-full py-12 text-[40px]" aria-label={`Pay ${AMOUNT} € into the demo jar`}>
          Pay {AMOUNT} €
          {pops.map((id) => (
            <span key={id} className="pop" aria-hidden="true">+{AMOUNT} €</span>
          ))}
        </button>
        <span className="sticker panel absolute -bottom-6 right-3 px-3 py-2 text-left text-[17px] font-semibold leading-tight shadow-[4px_4px_0_#000]" aria-live="polite">
          <span className="block text-[13px]">you owe</span>
          <b className="display tnum block text-2xl">{count * AMOUNT} €</b>
        </span>
      </div>
      <p className="text-sm">Try it. Nothing is saved.</p>
    </div>
  );
}
