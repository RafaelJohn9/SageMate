"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type UnitSummary = {
  id: string;
  name: string;
  _count: { content: number; questionSets: number };
};

export function SidebarNav({ units }: { units: UnitSummary[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/"
        className={`rounded-md px-2 py-1.5 text-sm font-medium ${
          pathname === "/" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
        }`}
      >
        All units
      </Link>

      <div className="mt-3 mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Units</div>
      {units.length === 0 && <p className="px-2 text-xs text-zinc-400">No units yet.</p>}
      {units.map((unit) => {
        const active = pathname === `/units/${unit.id}` || pathname.startsWith(`/units/${unit.id}/`);
        return (
          <Link
            key={unit.id}
            href={`/units/${unit.id}`}
            className={`rounded-md px-2 py-1.5 text-sm ${
              active
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            <div className="truncate">{unit.name}</div>
            <div className="text-xs text-zinc-400">
              {unit._count.content} content · {unit._count.questionSets} set{unit._count.questionSets === 1 ? "" : "s"}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
