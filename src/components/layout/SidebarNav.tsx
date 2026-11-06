"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type UnitSummary = {
  id: string;
  name: string;
  _count: { content: number; questionSets: number };
};

const itemBase = "shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors";
const active = "bg-highlight font-medium text-highlight-foreground";
const idle = "text-muted-foreground hover:bg-background hover:text-foreground";

export function SidebarNav({ units }: { units: UnitSummary[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Units"
      className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
    >
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={`${itemBase} font-medium ${pathname === "/" ? active : idle}`}
      >
        All units
      </Link>

      <div className="mt-4 mb-1 hidden px-2.5 text-xs font-medium text-muted-foreground md:block">
        Your units
      </div>
      {units.length === 0 && (
        <p className="hidden px-2.5 text-xs text-muted-foreground md:block">
          Create your first unit to see it here.
        </p>
      )}
      {units.map((unit) => {
        const isActive = pathname === `/units/${unit.id}` || pathname.startsWith(`/units/${unit.id}/`);
        return (
          <Link
            key={unit.id}
            href={`/units/${unit.id}`}
            aria-current={isActive ? "page" : undefined}
            className={`${itemBase} max-w-48 md:max-w-none ${isActive ? active : idle}`}
          >
            <div className="truncate">{unit.name}</div>
            <div className={`hidden text-xs md:block ${isActive ? "opacity-70" : "text-muted-foreground"}`}>
              {unit._count.content} content · {unit._count.questionSets} set
              {unit._count.questionSets === 1 ? "" : "s"}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
