# SageMate

A personal revision platform: paste or upload notes/assignments/past papers, organize them by unit,
generate open-ended revision questions, answer and grade them with an LLM, and export to PDF.

## Stack

- Next.js (App Router, TypeScript)
- SQLite via Prisma (`@prisma/adapter-better-sqlite3`)
- Groq for question generation and grading, behind a swappable `LLMProvider` interface
  (`src/lib/llm`) — add a new provider by implementing the interface and registering it in
  `src/lib/llm/factory.ts`
- `pdf-parse` / `mammoth` for PDF/DOCX text extraction
- `@react-pdf/renderer` for PDF export

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `GROQ_API_KEY` (get one at
   [console.groq.com/keys](https://console.groq.com/keys)):

   ```bash
   cp .env.example .env
   ```

3. Apply the database schema (creates `dev.db`):

   ```bash
   npx prisma migrate dev
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Create a **Unit** (e.g. a course).
2. Add **Content** to it — paste text or upload a PDF/DOCX. Tag each item as Notes or Past Paper,
   and give it a purpose (CAT1, CAT2, Exam, or a custom label). Past papers are used to infer
   question style/phrasing, not just as source material.
3. **Generate questions** for a unit, scoped to one or more purposes and specific content items.
   Each batch ends with two application-style questions; the rest are conceptual.
4. **Answer** — either grade each answer immediately, or answer the whole set and grade it in one
   batch call. Every submission is kept as a new attempt, so you can retry a question and see your
   answer history.
5. **Export** a question set to PDF: questions only, questions + your answers, or questions +
   answers + corrections.

## Morning repetition

A daily spaced-repetition session, at `/morning`.

- **Plan** (`/morning/plan`): add units, and for each choose a start and end date, the documents to
  read, and how far into each you want to get. Set how many questions you want each morning
  (default 5) and the fewest units they should be drawn from (default 3).
- **Reading**: each document is cut into parts along its chapters. What is unread is shared out
  evenly over the days left, so the daily share adjusts if you fall behind or read ahead. Tick parts
  off as you read them; "Prime me first" writes a short primer on what to look out for.
- **Questions**: each morning's session mixes questions that are due for review, new questions on
  what you read most recently (written on demand, from the parts you have ticked), and, if there is
  room, questions that are not due yet. Graded questions from your ordinary question sets on the same
  documents come round too.
- **Schedule**: Leitner boxes (`src/lib/spacedRepetition.ts`). A pass (70%+) moves a question up a
  box, due again in 1, 3, 7, 14, then 30 days; a fail sends it back to tomorrow. Nothing is scheduled
  past a unit's end date, so everything comes round once more before it.

## Notes

- Database: `dev.db` in the project root (gitignored). Inspect it with `npx prisma studio`.
- The Prisma client is generated into `src/generated/prisma` (gitignored); regenerate with
  `npx prisma generate` after schema changes.
