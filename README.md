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

## Notes

- Database: `dev.db` in the project root (gitignored). Inspect it with `npx prisma studio`.
- The Prisma client is generated into `src/generated/prisma` (gitignored); regenerate with
  `npx prisma generate` after schema changes.
