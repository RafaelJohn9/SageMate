import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ contentId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { contentId } = await params;
  await db.content.delete({ where: { id: contentId } });
  return new NextResponse(null, { status: 204 });
}
