export interface GenerateQuestionsInput {
  unitTitle: string;
  purpose: string;
  notesText: string;
  pastPaperText?: string;
  count: number;
}

export type QuestionTypeValue = "CONCEPTUAL" | "APPLICATION";

export interface GeneratedQuestion {
  text: string;
  questionType: QuestionTypeValue;
}

export interface GradeAnswerInput {
  questionText: string;
  sourceText: string;
  answerText: string;
}

export interface GradingResult {
  score: number;
  feedback: string;
  modelAnswer?: string;
}

export interface GradeAnswerBatchItem extends GradeAnswerInput {
  refId: string;
}

export interface GradeAnswerBatchResult extends GradingResult {
  refId: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]>;
  gradeAnswer(input: GradeAnswerInput): Promise<GradingResult>;
  gradeAnswerBatch(items: GradeAnswerBatchItem[]): Promise<GradeAnswerBatchResult[]>;
}
