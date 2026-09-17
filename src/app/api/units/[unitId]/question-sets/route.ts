import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
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
  const { name, purposeFilter, contentIds, count } = parsed.data;

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

  const questionSet = await db.questionSet.create({
    data: {
      unitId,
      name,
      purposeFilter: purposeFilter.join(","),
      status: "PENDING",
      provider: llm.name,
      model: llm.model,
      sourceContent: { create: contentIds.map((contentId) => ({ contentId })) },
    },
  });

  try {
    const generated = await llm.generateQuestions({
      unitTitle: unit.name,
      purpose: purposeFilter.join(","),
      notesText: notesText || "(no notes provided — rely on past paper style and general unit context)",
      pastPaperText,
      count,
    });

    if (generated.length === 0) {
      throw new Error("LLM returned no questions");
    }

    await db.$transaction([
      db.question.createMany({
        data: generated.map((q, index) => ({
          questionSetId: questionSet.id,
          text: q.text,
          orderIndex: index,
          questionType: q.questionType,
          marks: q.marks,
          markingScheme: q.markingScheme,
        })),
      }),
      db.questionSet.update({ where: { id: questionSet.id }, data: { status: "COMPLETED" } }),
    ]);
  } catch (err) {
    await db.questionSet.update({ where: { id: questionSet.id }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: `Question generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const result = await db.questionSet.findUnique({
    where: { id: questionSet.id },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json({ questionSet: result }, { status: 201 });
}
