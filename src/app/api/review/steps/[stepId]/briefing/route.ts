import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";

type RouteParams = { params: Promise<{ stepId: string }> };

// Writes (once) and returns the primer for a step: what to look out for before reading it.
export async function POST(_request: Request, { params }: RouteParams) {
  const { stepId } = await params;
  const step = await db.studyStep.findUnique({
    where: { id: stepId },
    include: {
      content: { select: { rawText: true } },
      track: { select: { unit: { select: { name: true } } } },
    },
  });
  if (!step) return NextResponse.json({ error: "That part of the plan no longer exists" }, { status: 404 });
  if (step.briefing) return NextResponse.json({ briefing: step.briefing });

  try {
    const briefing = await getLLMProvider().briefSection({
      unitTitle: step.track.unit.name,
      sectionTitle: step.title,
      sourceText: step.content.rawText.slice(step.start, step.end).trim(),
    });
    await db.studyStep.update({ where: { id: stepId }, data: { briefing } });
    return NextResponse.json({ briefing }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not write the briefing: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
