-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MatMode" ADD VALUE 'WHITE';
ALTER TYPE "MatMode" ADD VALUE 'BLACK';
ALTER TYPE "MatMode" ADD VALUE 'WOOD';

-- CreateTable
CREATE TABLE "AssetColourAnalysis" (
    "id" TEXT NOT NULL,
    "immichAssetId" TEXT NOT NULL,
    "lightness" DOUBLE PRECISION NOT NULL,
    "chroma" DOUBLE PRECISION NOT NULL,
    "hue" DOUBLE PRECISION NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetColourAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetColourAnalysis_immichAssetId_key" ON "AssetColourAnalysis"("immichAssetId");
