import { NextResponse } from "next/server";
import { saveTrack } from "@/lib/studyTracks";
import { saveTrackSchema } from "@/lib/validation/review";

// Creates the unit's study track, or replaces it if the unit already has one.
export async function POST(request: Request) {
  const parsed = saveTrackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const track = await saveTrack(parsed.data);
    return NextResponse.json({ track }, { status: 201 });
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
