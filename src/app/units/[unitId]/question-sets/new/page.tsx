import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { GenerateQuestionSetForm } from "@/components/question-sets/GenerateQuestionSetForm";

export default async function NewQuestionSetPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    include: { content: { orderBy: { createdAt: "desc" } } },
  });
  if (!unit) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href={`/units/${unitId}`} className="text-sm text-zinc-500 hover:underline">
          ← {unit.name}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Generate revision questions</h1>
      </header>
      <GenerateQuestionSetForm unitId={unitId} content={unit.content} />
    </div>
  );
}
