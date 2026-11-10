import { z } from "zod";

export const createQuestionSetSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  purposeFilter: z.array(z.string().trim().min(1)).min(1, "Select at least one purpose"),
  contentIds: z.array(z.string().min(1)).min(1, "Select at least one content item"),
  count: z.number().int().min(3).max(15).default(10),
  // Optional per-content section range, by index into the content's outline (both ends inclusive).
  ranges: z
    .record(
      z.string().min(1),
      z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }).refine((r) => r.from <= r.to, {
        message: "A section range must start before it ends",
      }),
    )
    .default({}),
  mode: z.enum(["generate", "extract", "revision"]).default("generate"),
});
