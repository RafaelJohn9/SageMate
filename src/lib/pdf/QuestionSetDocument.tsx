import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const FONTS_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(FONTS_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(FONTS_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "NotoSans" },
  title: { fontSize: 16, marginBottom: 4, fontFamily: "NotoSans", fontWeight: "bold" },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 20 },
  question: { marginBottom: 16 },
  questionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 },
  questionNumber: { fontWeight: "bold" },
  badge: { fontSize: 8, color: "#555", borderWidth: 1, borderColor: "#ccc", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  marksText: { fontSize: 9, color: "#666" },
  questionText: { marginBottom: 6, lineHeight: 1.4 },
  answerLabel: { fontWeight: "bold", fontSize: 9, color: "#333", marginBottom: 2 },
  answerText: { marginBottom: 6, lineHeight: 1.4, color: "#222" },
  correctionBox: { backgroundColor: "#f4f4f4", padding: 8, borderRadius: 4 },
  scoreLine: { fontWeight: "bold", marginBottom: 3 },
  feedbackText: { lineHeight: 1.4, marginBottom: 4 },
  modelAnswerText: { lineHeight: 1.4, color: "#444" },
});

export type PdfQuestion = {
  orderIndex: number;
  text: string;
  questionType: "CONCEPTUAL" | "APPLICATION";
  marks?: number | null;
  markingScheme?: string | null;
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

export function QuestionSetDocument({
  setName,
  unitName,
  questions,
  withAnswers,
  withCorrections,
}: {
  setName: string;
  unitName: string;
  questions: PdfQuestion[];
  withAnswers: boolean;
  withCorrections: boolean;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{setName}</Text>
        <Text style={styles.subtitle}>{unitName}</Text>

        {questions.map((q) => (
          <View key={q.orderIndex} style={styles.question} wrap={false}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionNumber}>Q{q.orderIndex + 1}</Text>
              <Text style={styles.badge}>{q.questionType === "APPLICATION" ? "Application" : "Conceptual"}</Text>
              {q.marks != null && <Text style={styles.marksText}>({q.marks} marks)</Text>}
            </View>
            <Text style={styles.questionText}>{q.text}</Text>

            {withAnswers && (
              <>
                <Text style={styles.answerLabel}>Your answer</Text>
                <Text style={styles.answerText}>{q.answerText || "(not answered)"}</Text>
              </>
            )}

            {withCorrections && q.grading && (
              <View style={styles.correctionBox}>
                <Text style={styles.scoreLine}>Score: {formatScore(q)}</Text>
                <Text style={styles.feedbackText}>{q.grading.feedback}</Text>
                {q.grading.modelAnswer && (
                  <Text style={styles.modelAnswerText}>Model answer: {q.grading.modelAnswer}</Text>
                )}
                {q.markingScheme && (
                  <Text style={styles.modelAnswerText}>Marking scheme: {q.markingScheme}</Text>
                )}
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}
