import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { extractPdfText } from "@/lib/parsing/pdf";
import { extractDocxText } from "@/lib/parsing/docx";
import { contentKindSchema, createPasteContentSchema, purposeSchema } from "@/lib/validation/content";

type RouteParams = { params: Promise<{ unitId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { unitId } = await params;
  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose");

  const content = await db.content.findMany({
    where: { unitId, ...(purpose ? { purpose } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ content });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { unitId } = await params;

  const unit = await db.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const title = formData.get("title");
    const contentKindRaw = formData.get("contentKind");
    const purposeRaw = formData.get("purpose");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }
    const titleResult = z.string().trim().min(1).max(200).safeParse(title);
    if (!titleResult.success) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const contentKindResult = contentKindSchema.safeParse(contentKindRaw ?? "NOTES");
    const purposeResult = purposeSchema.safeParse(purposeRaw ?? "GENERAL");
    if (!contentKindResult.success || !purposeResult.success) {
      return NextResponse.json({ error: "Invalid contentKind or purpose" }, { status: 400 });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");

    if (!isPdf && !isDocx) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const rawText = isPdf ? await extractPdfText(buffer) : await extractDocxText(buffer);

    if (!rawText) {
      return NextResponse.json({ error: "Could not extract any text from the file" }, { status: 422 });
    }

    const content = await db.content.create({
      data: {
        unitId,
        title: titleResult.data,
        sourceType: isPdf ? "PDF" : "DOCX",
        contentKind: contentKindResult.data,
        purpose: purposeResult.data,
        rawText,
        originalFilename: file.name,
      },
    });
    return NextResponse.json({ content }, { status: 201 });
  }

  const body = await request.json();
  const parsed = createPasteContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const content = await db.content.create({
    data: {
      unitId,
      title: parsed.data.title,
      sourceType: "PASTE",
      contentKind: parsed.data.contentKind,
      purpose: parsed.data.purpose,
      rawText: parsed.data.text,
    },
  });
  return NextResponse.json({ content }, { status: 201 });
}
