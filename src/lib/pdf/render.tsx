import { renderToBuffer } from "@react-pdf/renderer";
import { QuestionSetDocument, type PdfQuestion } from "./QuestionSetDocument";

export async function renderQuestionSetPdf(input: {
  setName: string;
  unitName: string;
  questions: PdfQuestion[];
  withAnswers: boolean;
  withCorrections: boolean;
}): Promise<Buffer> {
  return renderToBuffer(<QuestionSetDocument {...input} />);
}
