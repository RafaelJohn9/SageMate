export interface GenerateQuestionsInput {
  unitTitle: string;
  purpose: string;
  notesText: string;
  pastPaperText?: string;
  priorQuestions?: string[];
  count: number;
}

export interface ExtractQuestionsInput {
  unitTitle: string;
  sourceText: string;
}

export interface GenerateRevisionQAInput {
  unitTitle: string;
  purpose: string;
  sourceText: string;
}

export type QuestionTypeValue = "CONCEPTUAL" | "APPLICATION";

export interface GeneratedQuestion {
  text: string;
  questionType: QuestionTypeValue;
  marks: number;
  markingScheme: string;
}

export interface GeneratedRevisionQA extends GeneratedQuestion {
  answer: string;
}

export interface GradeAnswerInput {
  questionText: string;
  sourceText: string;
  answerText: string;
  marks?: number;
  markingScheme?: string;
}

export interface GradingResult {
  score: number;
  marksAwarded?: number | null;
  feedback: string;
  modelAnswer?: string;
}

export interface GradeAnswerBatchItem extends GradeAnswerInput {
  refId: string;
}

export interface GradeAnswerBatchResult extends GradingResult {
  refId: string;
}

export interface DiscussionTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DiscussAnswerInput {
  questionText: string;
  sourceText: string;
  answerText: string;
  marks?: number;
  markingScheme?: string;
  grading: GradingResult;
  history: DiscussionTurn[];
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]>;
  extractQuestions(input: ExtractQuestionsInput): Promise<GeneratedQuestion[]>;
  generateRevisionQA(input: GenerateRevisionQAInput): Promise<GeneratedRevisionQA[]>;
  gradeAnswer(input: GradeAnswerInput): Promise<GradingResult>;
  gradeAnswerBatch(items: GradeAnswerBatchItem[]): Promise<GradeAnswerBatchResult[]>;
  discussAnswer(input: DiscussAnswerInput): Promise<string>;
}
