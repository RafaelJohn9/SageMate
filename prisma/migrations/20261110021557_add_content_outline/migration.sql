-- AlterTable
ALTER TABLE "Content" ADD COLUMN "outline" JSONB;

-- AlterTable
ALTER TABLE "QuestionSetContent" ADD COLUMN "rangeEnd" INTEGER;
ALTER TABLE "QuestionSetContent" ADD COLUMN "rangeLabel" TEXT;
ALTER TABLE "QuestionSetContent" ADD COLUMN "rangeStart" INTEGER;
