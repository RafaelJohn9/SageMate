-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionSetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'CONCEPTUAL',
    "marks" INTEGER,
    "markingScheme" TEXT,
    "answer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "box" INTEGER NOT NULL DEFAULT 1,
    "dueAt" DATETIME,
    "lastReviewedAt" DATETIME,
    "lastResult" TEXT,
    CONSTRAINT "Question_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "createdAt", "id", "markingScheme", "marks", "orderIndex", "questionSetId", "questionType", "text") SELECT "answer", "createdAt", "id", "markingScheme", "marks", "orderIndex", "questionSetId", "questionType", "text" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_dueAt_idx" ON "Question"("dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
