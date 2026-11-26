import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toDay } from "@/lib/studyPlan";
import { markStepSchema } from "@/lib/validation/review";

type RouteParams = { params: Promise<{ stepId: string }> };

// Reading goes in order, so marking a step as read also marks every unread step before it, and
// marking it unread also unmarks every step after it.
export async function POST(request: Request, { params }: RouteParams) {
  const { stepId } = await params;
  const parsed = markStepSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const step = await db.studyStep.findUnique({ where: { id: stepId } });
  if (!step) return NextResponse.json({ error: "That part of the plan no longer exists" }, { status: 404 });

  const { count } = parsed.data.read
    ? await db.studyStep.updateMany({
        where: { trackId: step.trackId, orderIndex: { lte: step.orderIndex }, readOn: null },
        data: { readOn: toDay(new Date()) },
      })
    : await db.studyStep.updateMany({
        where: { trackId: step.trackId, orderIndex: { gte: step.orderIndex }, readOn: { not: null } },
        data: { readOn: null },
      });
  return NextResponse.json({ changed: count });
}
