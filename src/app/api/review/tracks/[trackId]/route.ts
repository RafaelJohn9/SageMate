import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteTrack } from "@/lib/studyTracks";
import { updateTrackSchema } from "@/lib/validation/review";

type RouteParams = { params: Promise<{ trackId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { trackId } = await params;
  const parsed = updateTrackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const existing = await db.studyTrack.findUnique({ where: { id: trackId } });
  if (!existing) return NextResponse.json({ error: "This unit is not in your plan" }, { status: 404 });

  const track = await db.studyTrack.update({ where: { id: trackId }, data: parsed.data });
  return NextResponse.json({ track });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { trackId } = await params;
  const deleted = await deleteTrack(trackId);
  if (!deleted) return NextResponse.json({ error: "This unit is not in your plan" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
