-- AlterTable
ALTER TABLE "fixture_instances" ADD COLUMN     "modeId" TEXT;

-- AddForeignKey
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "fixture_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
