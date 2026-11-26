import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReviewSettings } from "@/lib/morningSession";
import { reviewSettingsSchema } from "@/lib/validation/review";

export async function GET() {
  return NextResponse.json({ settings: await getReviewSettings() });
}

export async function PUT(request: Request) {
  const parsed = reviewSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const settings = await db.reviewSettings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data },
  });
  return NextResponse.json({ settings });
}
