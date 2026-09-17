import { z } from "zod";

export const contentKindSchema = z.enum(["NOTES", "PAST_PAPER"]);
export const purposeSchema = z.string().trim().min(1).max(50);

export const createPasteContentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  contentKind: contentKindSchema.default("NOTES"),
  purpose: purposeSchema.default("GENERAL"),
  text: z.string().trim().min(1, "Content text is required"),
});
