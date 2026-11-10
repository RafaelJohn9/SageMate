import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import { runGeneration } from "@/lib/generation";
import { createQuestionSetSchema } from "@/lib/validation/questionSets";
import { formatSource, resolveContentRange } from "@/lib/questionSets";

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
  const { name, purposeFilter, contentIds, count, mode, ranges } = parsed.data;

  const contentItems = await db.content.findMany({
    where: { id: { in: contentIds }, unitId },
  });
  if (contentItems.length === 0) {
    return NextResponse.json({ error: "No matching content found for this unit" }, { status: 400 });
  }

  // Narrow each source to the chapters the student picked, e.g. "everything up to Chapter 5".
  const sources = [];
  for (const content of contentItems) {
    try {
      const range = resolveContentRange(content, ranges[content.id]);
      sources.push({ content, range, text: formatSource(content, range) });
    } catch (err) {
      if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  }

  const notesText = sources
    .filter((s) => s.content.contentKind === "NOTES")
    .map((s) => s.text)
    .join("\n\n");
  const pastPaperSources = sources.filter((s) => s.content.contentKind === "PAST_PAPER");
  const pastPaperText =
    pastPaperSources.length > 0 ? pastPaperSources.map((s) => s.text).join("\n\n") : undefined;

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
      sourceContent: {
        create: sources.map(({ content, range }) => ({ contentId: content.id, ...range })),
      },
    },
  });

  const allSourceText = sources.map((s) => s.text).join("\n\n");

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
