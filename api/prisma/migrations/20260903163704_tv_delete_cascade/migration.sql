-- DropForeignKey
ALTER TABLE "Command" DROP CONSTRAINT "Command_tvId_fkey";

-- DropForeignKey
ALTER TABLE "Configuration" DROP CONSTRAINT "Configuration_tvId_fkey";

-- DropForeignKey
ALTER TABLE "QueueItem" DROP CONSTRAINT "QueueItem_tvId_fkey";

-- DropForeignKey
ALTER TABLE "TvPermission" DROP CONSTRAINT "TvPermission_tvId_fkey";

-- AddForeignKey
ALTER TABLE "TvPermission" ADD CONSTRAINT "TvPermission_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE CASCADE ON UPDATE CASCADE;
