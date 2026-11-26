import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import type { LLMProvider } from "@/lib/llm/types";
import { getReviewSettings, prepareSession } from "@/lib/morningSession";
import { effectiveStatus } from "@/lib/questionSetStatus";
import { toDay } from "@/lib/studyPlan";
import { startSessionSchema } from "@/lib/validation/review";

// Starts today's session, or tops it up: with { more: true } another round is added on top of what
// is already there. Choosing (and, where needed, writing) the questions runs after the response;
// the client watches the session's status.
export async function POST(request: Request) {
  const parsed = startSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const day = toDay(now);
  const settings = await getReviewSettings();
  const existing = await db.reviewSession.findUnique({
    where: { day },
    include: { _count: { select: { items: true } } },
  });
  if (existing && effectiveStatus(existing.status, existing.startedAt, now) === "PENDING") {
    return NextResponse.json({ session: existing }, { status: 202 });
  }

  const have = existing?._count.items ?? 0;
  const target = parsed.data.more ? have + settings.dailyQuestions : Math.max(have, settings.dailyQuestions);

  const session = existing
    ? await db.reviewSession.update({
        where: { id: existing.id },
        data: { status: "PENDING", error: null, startedAt: now },
      })
    : await db.reviewSession.create({ data: { day, startedAt: now } });

  // Reviews need no LLM, so a missing API key must not stop the session: only new questions do.
  let llm: LLMProvider | null = null;
  try {
    llm = getLLMProvider();
  } catch (err) {
    console.error("Morning session will run without new questions:", err);
  }

  after(() => prepareSession(llm, session.id, target, now));

  return NextResponse.json({ session }, { status: 202 });
}
