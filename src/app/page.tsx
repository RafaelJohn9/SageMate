import Link from "next/link";
import { db } from "@/lib/db";
import { CreateUnitForm } from "@/components/units/CreateUnitForm";
import { DeleteUnitButton } from "@/components/units/DeleteUnitButton";

export default async function Home() {
  const units = await db.unit.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { content: true, questionSets: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">SageMate</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Organize notes by unit, generate revision questions, and grade your own answers.
        </p>
      </header>

      <CreateUnitForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Units</h2>
        {units.length === 0 && (
          <p className="text-sm text-zinc-500">No units yet — create one above to get started.</p>
        )}
        <ul className="flex flex-col gap-2">
          {units.map((unit) => (
            <li
              key={unit.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <Link href={`/units/${unit.id}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {unit.name}
                </Link>
                {unit.description && (
                  <p className="text-sm text-zinc-500">{unit.description}</p>
                )}
                <p className="text-xs text-zinc-400">
                  {unit._count.content} content item{unit._count.content === 1 ? "" : "s"} ·{" "}
                  {unit._count.questionSets} question set{unit._count.questionSets === 1 ? "" : "s"}
                </p>
              </div>
              <DeleteUnitButton unitId={unit.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
