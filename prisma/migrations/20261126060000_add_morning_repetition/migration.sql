-- CreateTable
CREATE TABLE "ReviewSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "dailyQuestions" INTEGER NOT NULL DEFAULT 5,
    "minUnits" INTEGER NOT NULL DEFAULT 3
);

-- CreateTable
CREATE TABLE "StudyTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "bankSetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyTrack_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyTrack_bankSetId_fkey" FOREIGN KEY ("bankSetId") REFERENCES "QuestionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyTrackContent" (
    "trackId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "fromSection" INTEGER,
    "toSection" INTEGER,

    PRIMARY KEY ("trackId", "contentId"),
    CONSTRAINT "StudyTrackContent_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StudyTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyTrackContent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "readOn" TEXT,
    "briefing" TEXT,
    CONSTRAINT "StudyStep_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StudyTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyStep_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReviewSessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attemptId" TEXT,
    CONSTRAINT "ReviewSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewSessionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewSessionItem_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "stepId" TEXT,
    CONSTRAINT "Question_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "StudyStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("answer", "box", "createdAt", "dueAt", "id", "lastResult", "lastReviewedAt", "markingScheme", "marks", "orderIndex", "questionSetId", "questionType", "text") SELECT "answer", "box", "createdAt", "dueAt", "id", "lastResult", "lastReviewedAt", "markingScheme", "marks", "orderIndex", "questionSetId", "questionType", "text" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
CREATE INDEX "Question_dueAt_idx" ON "Question"("dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StudyTrack_unitId_key" ON "StudyTrack"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTrack_bankSetId_key" ON "StudyTrack"("bankSetId");

-- CreateIndex
CREATE INDEX "StudyStep_trackId_orderIndex_idx" ON "StudyStep"("trackId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSession_day_key" ON "ReviewSession"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSessionItem_attemptId_key" ON "ReviewSessionItem"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSessionItem_sessionId_questionId_key" ON "ReviewSessionItem"("sessionId", "questionId");

