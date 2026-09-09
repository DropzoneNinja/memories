-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "allowZoom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN     "allowZoom" BOOLEAN NOT NULL DEFAULT false;
