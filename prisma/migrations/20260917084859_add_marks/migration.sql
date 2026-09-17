-- AlterTable
ALTER TABLE "Grading" ADD COLUMN "marksAwarded" INTEGER;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "markingScheme" TEXT;
ALTER TABLE "Question" ADD COLUMN "marks" INTEGER;
