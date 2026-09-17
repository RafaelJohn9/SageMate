import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createUnitSchema } from "@/lib/validation/units";

export async function GET() {
  const units = await db.unit.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { content: true, questionSets: true } },
    },
  });
  return NextResponse.json({ units });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const unit = await db.unit.create({ data: parsed.data });
  return NextResponse.json({ unit }, { status: 201 });
}
