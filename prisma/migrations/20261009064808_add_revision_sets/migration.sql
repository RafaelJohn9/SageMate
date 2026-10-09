-- AlterTable
ALTER TABLE "Question" ADD COLUMN "answer" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuestionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purposeFilter" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRACTICE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionSet_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuestionSet" ("createdAt", "id", "model", "name", "provider", "purposeFilter", "status", "unitId") SELECT "createdAt", "id", "model", "name", "provider", "purposeFilter", "status", "unitId" FROM "QuestionSet";
DROP TABLE "QuestionSet";
ALTER TABLE "new_QuestionSet" RENAME TO "QuestionSet";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
