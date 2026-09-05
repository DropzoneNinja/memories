-- CreateEnum
CREATE TYPE "DisplayMode" AS ENUM ('IMAGES', 'VIDEO');

-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "displayMode" "DisplayMode" NOT NULL DEFAULT 'IMAGES',
ADD COLUMN     "loop" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN     "displayMode" "DisplayMode" NOT NULL DEFAULT 'IMAGES',
ADD COLUMN     "loop" BOOLEAN NOT NULL DEFAULT false;
