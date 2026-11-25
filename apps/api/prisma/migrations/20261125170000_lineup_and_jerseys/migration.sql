-- AlterTable
ALTER TABLE "Club" ADD COLUMN "jerseys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "lineup" JSONB;
