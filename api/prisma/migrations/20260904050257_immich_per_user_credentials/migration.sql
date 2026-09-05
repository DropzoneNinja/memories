-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "immichOwnerId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "immichApiKeyEncrypted" TEXT,
ADD COLUMN     "immichKeyLast4" TEXT;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_immichOwnerId_fkey" FOREIGN KEY ("immichOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
