-- AlterTable
ALTER TABLE "Tv" ADD COLUMN     "currentPresentationId" TEXT,
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false;
