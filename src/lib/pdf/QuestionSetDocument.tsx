import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PdfMarkdown } from "./PdfMarkdown";

const FONTS_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(FONTS_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(FONTS_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

// react-pdf hyphenates by default, splitting words mid-line ("manipulat-ed"). Keep words whole.
Font.registerHyphenationCallback((word) => [word]);

// Noto Sans has tall built-in line metrics, so lineHeight multipliers look larger than in a browser:
// 1.25 here reads like ~1.5 on screen.
const LINE = 1.25;

const INK = "#1f2a44";
const MUTED = "#5b6472";
const RULE = "#dcd9d0";
const ANSWER_BG = "#f6f5f1";
const ACCENT = "#b8722e";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 54,
    fontSize: 10.5,
    lineHeight: LINE,
    fontFamily: "NotoSans",
    color: INK,
  },
  // Set explicitly: an inherited lineHeight is resolved against the page's 10.5pt font, too tight for 17pt.
  title: { fontSize: 17, lineHeight: 1.3, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 9.5, color: MUTED },
  headerRule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 10, marginBottom: 18 },
  question: { marginBottom: 16 },
  questionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  questionNumber: { fontWeight: "bold", marginRight: 8 },
  meta: { fontSize: 8.5, color: MUTED },
  questionText: { fontSize: 11, marginBottom: 6 },
  answerBox: {
    backgroundColor: ANSWER_BG,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  correctionBox: { backgroundColor: ANSWER_BG, paddingVertical: 7, paddingHorizontal: 10 },
  label: { fontSize: 8.5, fontWeight: "bold", color: MUTED, marginBottom: 3 },
  body: { color: INK },
  quiet: { color: MUTED },
  schemeText: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  scoreLine: { fontWeight: "bold", marginBottom: 3 },
  sectionGap: { marginTop: 4 },
  footer: { position: "absolute", bottom: 26, left: 54, right: 54, fontSize: 8, color: MUTED },
});

export type PdfQuestion = {
  orderIndex: number;
  text: string;
  questionType: "CONCEPTUAL" | "APPLICATION";
  marks?: number | null;
  markingScheme?: string | null;
  modelAnswer?: string | null;
  answerText?: string | null;
  grading?: {
    score: number;
    marksAwarded?: number | null;
    feedback: string;
    modelAnswer?: string | null;
  } | null;
};

function formatScore(q: PdfQuestion): string {
  const grading = q.grading;
  if (!grading) return "";
  if (grading.marksAwarded != null && q.marks != null) {
    return `${grading.marksAwarded}/${q.marks} marks`;
  }
  return `${grading.score}/100`;
}

// Short questions are kept whole on one page. Long ones (big answers + feedback) may break, since a
// block taller than the space left would otherwise leave a large gap or overflow the page.
const KEEP_TOGETHER_CHARS = 700;

function contentLength(q: PdfQuestion, opts: { answers: boolean; corrections: boolean; model: boolean }) {
  let n = q.text.length;
  if (opts.model) n += (q.modelAnswer?.length ?? 0) + (q.markingScheme?.length ?? 0);
  if (opts.answers) n += q.answerText?.length ?? 0;
  if (opts.corrections && q.grading) {
    n += q.grading.feedback.length + (q.grading.modelAnswer?.length ?? 0) + (q.markingScheme?.length ?? 0);
  }
  return n;
}

export function QuestionSetDocument({
  setName,
  unitName,
  questions,
  withAnswers,
  withCorrections,
  withModelAnswers = false,
}: {
  setName: string;
  unitName: string;
  questions: PdfQuestion[];
  withAnswers: boolean;
  withCorrections: boolean;
  withModelAnswers?: boolean;
}) {
  const opts = { answers: withAnswers, corrections: withCorrections, model: withModelAnswers };

  return (
    <Document title={setName} subject={unitName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{setName}</Text>
        <Text style={styles.subtitle}>
          {unitName} — {questions.length} questions
          {withModelAnswers ? " with model answers" : ""}
        </Text>
        <View style={styles.headerRule} />

        {questions.map((q) => (
          <View
            key={q.orderIndex}
            style={styles.question}
            wrap={contentLength(q, opts) > KEEP_TOGETHER_CHARS}
          >
            {/* Never leave a question stranded at the bottom of a page without the start of its answer. */}
            <View wrap={false} minPresenceAhead={60}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionNumber}>Q{q.orderIndex + 1}</Text>
                <Text style={styles.meta}>
                  {q.questionType === "APPLICATION" ? "Application" : "Conceptual"}
                  {q.marks != null ? `  ·  ${q.marks} marks` : ""}
                </Text>
              </View>
              <Text style={styles.questionText}>{q.text}</Text>
            </View>

            {withModelAnswers && q.modelAnswer && (
              <View style={styles.answerBox}>
                <Text style={styles.label}>Model answer</Text>
                <PdfMarkdown style={styles.body}>{q.modelAnswer}</PdfMarkdown>
                {q.markingScheme && <Text style={styles.schemeText}>Marking scheme: {q.markingScheme}</Text>}
              </View>
            )}

            {withAnswers && (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.label}>Your answer</Text>
                <Text style={q.answerText ? styles.body : styles.quiet}>{q.answerText || "(not answered)"}</Text>
              </View>
            )}

            {withCorrections && q.grading && (
              <View style={styles.correctionBox}>
                <Text style={styles.scoreLine}>Score: {formatScore(q)}</Text>
                <PdfMarkdown style={styles.body}>{q.grading.feedback}</PdfMarkdown>
                {q.grading.modelAnswer && (
                  <View style={styles.sectionGap}>
                    <Text style={styles.label}>Model answer</Text>
                    <PdfMarkdown style={styles.quiet}>{q.grading.modelAnswer}</PdfMarkdown>
                  </View>
                )}
                {q.markingScheme && <Text style={styles.schemeText}>Marking scheme: {q.markingScheme}</Text>}
              </View>
            )}
          </View>
        ))}

        {/* Page numbers (a Text render prop) crash react-pdf's layout on some sets, so the footer is static. */}
        <Text style={styles.footer} fixed>
          {setName} — {unitName}
        </Text>
      </Page>
    </Document>
  );
}
