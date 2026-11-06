import Link from "next/link";
import { db } from "@/lib/db";
import { SidebarNav } from "./SidebarNav";

export async function Sidebar() {
  const units = await db.unit.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, _count: { select: { content: true, questionSets: true } } },
  });

  return (
    // The red rule down the edge is the margin line of an exercise book.
    <aside className="flex w-full shrink-0 flex-col gap-3 border-b-2 border-mark/45 bg-card px-3 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:gap-5 md:overflow-y-auto md:border-r-2 md:border-b-0 md:py-6">
      <Link
        href="/"
        className="px-2 font-display text-2xl font-bold tracking-tight text-foreground"
      >
        SageMate
      </Link>
      <SidebarNav units={units} />
    </aside>
  );
}
