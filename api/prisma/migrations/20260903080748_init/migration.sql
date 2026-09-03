-- CreateEnum
CREATE TYPE "PlaybackMode" AS ENUM ('SEQUENTIAL', 'SHUFFLE');

-- CreateEnum
CREATE TYPE "MatMode" AS ENUM ('AUTOMATIC', 'NEUTRAL', 'WARM', 'COOL', 'DARK', 'LIGHT', 'COMPLEMENTARY', 'ANALOGOUS');

-- CreateEnum
CREATE TYPE "DisconnectedBehavior" AS ENUM ('CONTINUE_QUEUE', 'REPEAT_QUEUE', 'FREEZE');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('NEXT', 'PREVIOUS', 'PAUSE', 'RESUME');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'DELIVERED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tv" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pairingCode" TEXT,
    "pairingCodeExpiresAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvPermission" (
    "id" TEXT NOT NULL,
    "tvId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TvPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "immichAlbumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "tvId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "albumIds" TEXT[],
    "intervalSeconds" INTEGER NOT NULL DEFAULT 600,
    "playbackMode" "PlaybackMode" NOT NULL DEFAULT 'SHUFFLE',
    "matMode" "MatMode" NOT NULL DEFAULT 'AUTOMATIC',
    "disconnectedBehavior" "DisconnectedBehavior" NOT NULL DEFAULT 'CONTINUE_QUEUE',
    "cacheSize" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "tvId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "presentationId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "background" JSONB NOT NULL,
    "frame" JSONB NOT NULL,
    "transition" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "tvId" TEXT NOT NULL,
    "type" "CommandType" NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tvId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tv_deviceId_key" ON "Tv"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tv_pairingCode_key" ON "Tv"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "TvPermission_tvId_userId_key" ON "TvPermission"("tvId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Album_immichAlbumId_key" ON "Album"("immichAlbumId");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_tvId_version_key" ON "Configuration"("tvId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QueueItem_presentationId_key" ON "QueueItem"("presentationId");

-- CreateIndex
CREATE INDEX "QueueItem_tvId_position_idx" ON "QueueItem"("tvId", "position");

-- AddForeignKey
ALTER TABLE "TvPermission" ADD CONSTRAINT "TvPermission_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvPermission" ADD CONSTRAINT "TvPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tvId_fkey" FOREIGN KEY ("tvId") REFERENCES "Tv"("id") ON DELETE SET NULL ON UPDATE CASCADE;
