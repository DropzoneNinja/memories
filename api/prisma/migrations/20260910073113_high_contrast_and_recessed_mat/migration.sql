-- AlterEnum
ALTER TYPE "MatMode" ADD VALUE 'HIGH_CONTRAST';

-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "matRecessed" BOOLEAN NOT NULL DEFAULT false;
