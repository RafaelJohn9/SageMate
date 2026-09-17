import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ setId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { setId } = await params;
  const questionSet = await db.questionSet.findUnique({
    where: { id: setId },
    include: {
      unit: true,
      sourceContent: { include: { content: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        include: { attempts: { orderBy: { submittedAt: "desc" }, take: 1, include: { grading: true } } },
      },
    },
  });
  if (!questionSet) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404 });
  }
  return NextResponse.json({ questionSet });
}
