-- CreateTable
CREATE TABLE "fixture_modes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "channelCount" INTEGER NOT NULL,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "fixture_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mode_channels" (
    "id" TEXT NOT NULL,
    "modeId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,

    CONSTRAINT "mode_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixture_modes_definitionId_name_key" ON "fixture_modes"("definitionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mode_channels_modeId_offset_key" ON "mode_channels"("modeId", "offset");

-- AddForeignKey
ALTER TABLE "fixture_modes" ADD CONSTRAINT "fixture_modes_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "fixture_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_channels" ADD CONSTRAINT "mode_channels_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "fixture_modes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_channels" ADD CONSTRAINT "mode_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
