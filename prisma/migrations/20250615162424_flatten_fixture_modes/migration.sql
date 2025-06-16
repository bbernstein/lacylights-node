-- AlterTable
ALTER TABLE "fixture_instances" ADD COLUMN     "channel_count" INTEGER,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "mode_name" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "type" "FixtureType";

-- CreateTable
CREATE TABLE "instance_channels" (
    "id" TEXT NOT NULL,
    "fixture_id" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "min_value" INTEGER NOT NULL DEFAULT 0,
    "max_value" INTEGER NOT NULL DEFAULT 255,
    "default_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "instance_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instance_channels_fixture_id_offset_key" ON "instance_channels"("fixture_id", "offset");

-- AddForeignKey
ALTER TABLE "instance_channels" ADD CONSTRAINT "instance_channels_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixture_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
