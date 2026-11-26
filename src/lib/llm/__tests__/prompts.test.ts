import { describe, expect, it } from "vitest";
import {
  buildDiscussAnswerSystemPrompt,
  buildGenerateQuestionsPrompt,
  buildGradeAnswerBatchPrompt,
  buildGradeAnswerPrompt,
} from "../prompts";

describe("buildGenerateQuestionsPrompt", () => {
  const base = { unitTitle: "Bio", purpose: "CAT1", notesText: "Cells are units of life.", count: 10 };

  it("includes notes and requests JSON only", () => {
    const { system, user } = buildGenerateQuestionsPrompt(base);
    expect(system).toMatch(/strict JSON/);
    expect(user).toContain("Cells are units of life.");
  });
  it("notes the absence of past papers and prior questions", () => {
    const { user } = buildGenerateQuestionsPrompt(base);
    expect(user).toContain("No past paper examples");
    expect(user).toContain("No prior questions recorded");
  });
  it("lists prior questions and past papers when given", () => {
    const { user } = buildGenerateQuestionsPrompt({
      ...base,
      pastPaperText: "PAPER TEXT",
      priorQuestions: ["Old one?", "Old two?"],
    });
    expect(user).toContain("PAPER TEXT");
    expect(user).toContain("1. Old one?");
    expect(user).toContain("2. Old two?");
  });
  it("ends with two application questions by default, or as many as asked for", () => {
    expect(buildGenerateQuestionsPrompt(base).user).toContain("final 2 questions must be APPLICATION");
    const { user } = buildGenerateQuestionsPrompt({ ...base, count: 3, applicationCount: 1 });
    expect(user).toContain("first 2 questions must be CONCEPTUAL");
    expect(user).toContain("final 1 questions must be APPLICATION");
  });
  it("truncates very long source text", () => {
    const { user } = buildGenerateQuestionsPrompt({ ...base, notesText: "z".repeat(500_000) });
    expect(user.length).toBeLessThan(200_000);
  });
});

describe("grading prompts", () => {
  const item = { questionText: "Why?", sourceText: "src", answerText: "Because", marks: 4, markingScheme: "2x2" };

  it("includes question, answer and marking scheme", () => {
    const { user } = buildGradeAnswerPrompt(item);
    expect(user).toContain("Why?");
    expect(user).toContain("Because");
    expect(user).toContain("2x2");
  });
  it("batch prompt carries every refId", () => {
    const { user } = buildGradeAnswerBatchPrompt([
      { ...item, refId: "r1" },
      { ...item, refId: "r2" },
    ]);
    expect(user).toContain('refId: "r1"');
    expect(user).toContain('refId: "r2"');
    expect(user).toContain("2 question/answer pairs");
  });
});

describe("buildDiscussAnswerSystemPrompt", () => {
  const input = {
    questionText: "Q",
    sourceText: "S",
    answerText: "A",
    history: [],
    grading: { score: 60, marksAwarded: 3, feedback: "ok" },
  };
  it("shows marks when a scheme total exists", () => {
    expect(buildDiscussAnswerSystemPrompt({ ...input, marks: 5 })).toContain("3/5 marks");
  });
  it("falls back to a percentage", () => {
    expect(buildDiscussAnswerSystemPrompt(input)).toContain("60/100");
  });
});
