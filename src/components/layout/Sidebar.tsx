import Link from "next/link";
import { db } from "@/lib/db";
import { SidebarNav } from "./SidebarNav";

export async function Sidebar() {
  const units = await db.unit.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, _count: { select: { content: true, questionSets: true } } },
  });

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-zinc-200 px-3 py-6 dark:border-zinc-800">
      <Link href="/" className="px-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        SageMate
      </Link>
      <SidebarNav units={units} />
    </aside>
  );
}
