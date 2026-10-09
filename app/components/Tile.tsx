import { Link } from "react-router";

const COLORS = ["bg-pink", "bg-blue text-white", "bg-mint", "bg-white"];

export function tileColor(index: number): string {
  return COLORS[index % COLORS.length];
}

export interface TileJar {
  id: string;
  title: string;
  countLabel: string;
  balanceLabel: string;
}

export function Tile({ jar, index }: { jar: TileJar; index: number }) {
  const wide = index === 0;
  return (
    <Link
      to={`/jars/${jar.id}`}
      className={`panel raised flex p-3.5 ${tileColor(index)} ${wide ? "col-span-2 min-h-[120px] flex-row items-end justify-between" : "min-h-[168px] flex-col justify-between"}`}
    >
      <h3 className="display text-2xl">{jar.title}</h3>
      <div className={`text-[15px] font-semibold leading-tight ${wide ? "text-right" : ""}`}>
        {jar.countLabel}
        <b className="display tnum block text-[22px]">{jar.balanceLabel}</b>
      </div>
    </Link>
  );
}
