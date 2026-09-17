import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateUnitSchema } from "@/lib/validation/units";

type RouteParams = { params: Promise<{ unitId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { unitId } = await params;
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    include: {
      content: { orderBy: { createdAt: "desc" } },
      questionSets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }
  return NextResponse.json({ unit });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { unitId } = await params;
  const body = await request.json();
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const unit = await db.unit.update({ where: { id: unitId }, data: parsed.data });
  return NextResponse.json({ unit });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { unitId } = await params;
  await db.unit.delete({ where: { id: unitId } });
  return new NextResponse(null, { status: 204 });
}
