import { z } from "zod";

export const createQuestionSetSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  purposeFilter: z.array(z.string().trim().min(1)).min(1, "Select at least one purpose"),
  contentIds: z.array(z.string().min(1)).min(1, "Select at least one content item"),
  count: z.number().int().min(3).max(15).default(10),
});
