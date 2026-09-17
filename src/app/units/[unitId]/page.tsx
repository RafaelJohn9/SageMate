import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DeleteContentButton } from "@/components/content/DeleteContentButton";
import { RenameUnitForm } from "@/components/units/RenameUnitForm";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    include: {
      content: { orderBy: { createdAt: "desc" } },
      questionSets: {
        orderBy: { createdAt: "desc" },
        include: {
          questions: { include: { _count: { select: { attempts: true } } } },
        },
      },
    },
  });

  if (!unit) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← All units
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{unit.name}</h1>
        {unit.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{unit.description}</p>}
        <RenameUnitForm unitId={unit.id} initialName={unit.name} initialDescription={unit.description} />
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Content</h2>
          <Link href={`/units/${unit.id}/content/new`} className="text-sm text-zinc-500 hover:underline">
            + Add content
          </Link>
        </div>
        {unit.content.length === 0 ? (
          <p className="text-sm text-zinc-500">No content added yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unit.content.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div>
                  <span className="font-medium">{c.title}</span>{" "}
                  <span className="text-zinc-400">
                    ({c.contentKind === "PAST_PAPER" ? "past paper" : "notes"} · {c.purpose})
                  </span>
                  <p className="text-xs text-zinc-400">Added {formatRelativeTime(c.createdAt)}</p>
                </div>
                <DeleteContentButton contentId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Question sets</h2>
          <Link href={`/units/${unit.id}/question-sets/new`} className="text-sm text-zinc-500 hover:underline">
            + Generate questions
          </Link>
        </div>
        {unit.questionSets.length === 0 ? (
          <p className="text-sm text-zinc-500">No question sets generated yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unit.questionSets.map((qs) => {
              const total = qs.questions.length;
              const answered = qs.questions.filter((q) => q._count.attempts > 0).length;
              return (
                <li key={qs.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <Link href={`/question-sets/${qs.id}`} className="font-medium hover:underline">
                    {qs.name}
                  </Link>{" "}
                  <span className="text-zinc-400">({qs.status.toLowerCase()})</span>
                  <p className="text-xs text-zinc-400">
                    Generated {formatRelativeTime(qs.createdAt)} · {answered}/{total} answered · purpose:{" "}
                    {qs.purposeFilter}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
