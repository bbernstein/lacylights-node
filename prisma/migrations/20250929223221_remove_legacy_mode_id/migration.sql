/*
  Warnings:

  - You are about to drop the column `mode_id` on the `fixture_instances` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "fixture_instances" DROP CONSTRAINT "fixture_instances_mode_id_fkey";

-- AlterTable
ALTER TABLE "fixture_instances" DROP COLUMN "mode_id";
