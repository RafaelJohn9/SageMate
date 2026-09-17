import { db } from "@/lib/db";

export async function getQuestionSetSourceText(questionSetId: string): Promise<string> {
  const sourceContent = await db.questionSetContent.findMany({
    where: { questionSetId },
    include: { content: true },
  });
  return sourceContent.map((sc) => `## ${sc.content.title}\n${sc.content.rawText}`).join("\n\n");
}
