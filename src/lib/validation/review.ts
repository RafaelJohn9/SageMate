import { z } from "zod";
import { isValidDay } from "@/lib/studyPlan";

const daySchema = z.string().refine(isValidDay, { message: "Pick a valid date" });

export const reviewSettingsSchema = z.object({
  dailyQuestions: z.number().int().min(1, "Ask at least 1 question").max(20, "20 questions at most"),
  minUnits: z.number().int().min(1, "Draw from at least 1 unit").max(10),
});

export const saveTrackSchema = z
  .object({
    unitId: z.string().min(1),
    startDate: daySchema,
    endDate: daySchema,
    // The documents to get through, in reading order. `from`/`to` are indices into the document's
    // outline (both inclusive); leave them out to cover the whole document.
    sources: z
      .array(
        z
          .object({
            contentId: z.string().min(1),
            from: z.number().int().min(0).optional(),
            to: z.number().int().min(0).optional(),
          })
          .refine((s) => (s.from === undefined) === (s.to === undefined), {
            message: "Give both ends of a section range, or neither",
          })
          .refine((s) => s.from === undefined || s.to === undefined || s.from <= s.to, {
            message: "A section range must start before it ends",
          }),
      )
      .min(1, "Tick at least one document"),
  })
  .refine((t) => t.startDate <= t.endDate, { message: "The end date must be on or after the start date" });

export const updateTrackSchema = z.object({ paused: z.boolean() });

export const markStepSchema = z.object({ read: z.boolean() });

export const startSessionSchema = z.object({ more: z.boolean().default(false) });
