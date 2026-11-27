-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "contact" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "attendanceAlertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Club" ADD COLUMN "attendanceAlertPercent" INTEGER;
