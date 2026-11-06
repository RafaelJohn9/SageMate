import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import { runGeneration } from "@/lib/generation";
import { createQuestionSetSchema } from "@/lib/validation/questionSets";

type RouteParams = { params: Promise<{ unitId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { unitId } = await params;
  const questionSets = await db.questionSet.findMany({
    where: { unitId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });
  return NextResponse.json({ questionSets });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { unitId } = await params;

  const unit = await db.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createQuestionSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, purposeFilter, contentIds, count, mode } = parsed.data;

  const contentItems = await db.content.findMany({
    where: { id: { in: contentIds }, unitId },
  });
  if (contentItems.length === 0) {
    return NextResponse.json({ error: "No matching content found for this unit" }, { status: 400 });
  }

  const notesText = contentItems
    .filter((c) => c.contentKind === "NOTES")
    .map((c) => `## ${c.title}\n${c.rawText}`)
    .join("\n\n");
  const pastPaperItems = contentItems.filter((c) => c.contentKind === "PAST_PAPER");
  const pastPaperText =
    pastPaperItems.length > 0
      ? pastPaperItems.map((c) => `## ${c.title}\n${c.rawText}`).join("\n\n")
      : undefined;

  if (!notesText && !pastPaperText) {
    return NextResponse.json({ error: "Selected content has no extractable text" }, { status: 400 });
  }

  const llm = getLLMProvider();

  const priorQuestionRows =
    mode === "generate"
      ? await db.question.findMany({
          where: { questionSet: { unitId } },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { text: true },
        })
      : [];
  const priorQuestions = priorQuestionRows.map((q) => q.text);

  const questionSet = await db.questionSet.create({
    data: {
      unitId,
      name,
      purposeFilter: purposeFilter.join(","),
      kind: mode === "revision" ? "REVISION" : "PRACTICE",
      status: "PENDING",
      provider: llm.name,
      model: llm.model,
      sourceContent: { create: contentIds.map((contentId) => ({ contentId })) },
    },
  });

  const allSourceText = contentItems.map((c) => `## ${c.title}\n${c.rawText}`).join("\n\n");

  // Generation can take minutes (revision sets are written in parts), so it runs after the response:
  // the client gets the pending set straight away and watches its status.
  after(() =>
    runGeneration(llm, {
      questionSetId: questionSet.id,
      mode,
      unitTitle: unit.name,
      purpose: purposeFilter.join(","),
      count,
      notesText,
      pastPaperText,
      allSourceText,
      priorQuestions,
    }),
  );

  return NextResponse.json({ questionSet }, { status: 202 });
}
