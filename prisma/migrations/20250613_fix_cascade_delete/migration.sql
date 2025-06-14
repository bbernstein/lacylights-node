-- DropForeignKey
ALTER TABLE "cues" DROP CONSTRAINT "cues_scene_id_fkey";

-- AddForeignKey
ALTER TABLE "cues" ADD CONSTRAINT "cues_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;