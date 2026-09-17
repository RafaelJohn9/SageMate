import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AddContentForm } from "@/components/content/AddContentForm";

export default async function NewContentPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const unit = await db.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href={`/units/${unitId}`} className="text-sm text-zinc-500 hover:underline">
          ← {unit.name}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Add content</h1>
      </header>
      <AddContentForm unitId={unitId} />
    </div>
  );
}
