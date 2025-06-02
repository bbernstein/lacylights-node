-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "FixtureType" AS ENUM ('LED_PAR', 'MOVING_HEAD', 'STROBE', 'DIMMER', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('INTENSITY', 'RED', 'GREEN', 'BLUE', 'WHITE', 'AMBER', 'UV', 'PAN', 'TILT', 'ZOOM', 'FOCUS', 'IRIS', 'GOBO', 'COLOR_WHEEL', 'EFFECT', 'STROBE', 'MACRO', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_definitions" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" "FixtureType" NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixture_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "offset" INTEGER NOT NULL,
    "minValue" INTEGER NOT NULL DEFAULT 0,
    "maxValue" INTEGER NOT NULL DEFAULT 255,
    "defaultValue" INTEGER NOT NULL DEFAULT 0,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "channel_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_instances" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "universe" INTEGER NOT NULL,
    "startChannel" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixture_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_values" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,

    CONSTRAINT "fixture_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_values" (
    "id" TEXT NOT NULL,
    "fixtureValueId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "channel_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cue_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cue_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cueNumber" DOUBLE PRECISION NOT NULL,
    "cueListId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "fadeInTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fadeOutTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "followTime" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_users_userId_projectId_key" ON "project_users"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_definitions_manufacturer_model_key" ON "fixture_definitions"("manufacturer", "model");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_instances_projectId_universe_startChannel_key" ON "fixture_instances"("projectId", "universe", "startChannel");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_values_sceneId_fixtureId_key" ON "fixture_values"("sceneId", "fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_values_fixtureValueId_channelId_key" ON "channel_values"("fixtureValueId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "cues_cueListId_cueNumber_key" ON "cues"("cueListId", "cueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "preview_sessions_projectId_userId_key" ON "preview_sessions"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_definitions" ADD CONSTRAINT "channel_definitions_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "fixture_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "fixture_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_values" ADD CONSTRAINT "fixture_values_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_values" ADD CONSTRAINT "fixture_values_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixture_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_values" ADD CONSTRAINT "channel_values_fixtureValueId_fkey" FOREIGN KEY ("fixtureValueId") REFERENCES "fixture_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_values" ADD CONSTRAINT "channel_values_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cue_lists" ADD CONSTRAINT "cue_lists_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cues" ADD CONSTRAINT "cues_cueListId_fkey" FOREIGN KEY ("cueListId") REFERENCES "cue_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cues" ADD CONSTRAINT "cues_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
