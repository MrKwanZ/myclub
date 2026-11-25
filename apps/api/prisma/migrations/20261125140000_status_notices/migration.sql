-- CreateTable
CREATE TABLE "StatusNotice" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusNoticeRead" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusNoticeRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusNotice_clubId_createdAt_idx" ON "StatusNotice"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatusNoticeRead_noticeId_userId_key" ON "StatusNoticeRead"("noticeId", "userId");

-- CreateIndex
CREATE INDEX "StatusNoticeRead_userId_idx" ON "StatusNoticeRead"("userId");

-- AddForeignKey
ALTER TABLE "StatusNotice" ADD CONSTRAINT "StatusNotice_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusNotice" ADD CONSTRAINT "StatusNotice_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusNoticeRead" ADD CONSTRAINT "StatusNoticeRead_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "StatusNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusNoticeRead" ADD CONSTRAINT "StatusNoticeRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
