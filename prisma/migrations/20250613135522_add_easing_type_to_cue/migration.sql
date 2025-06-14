-- CreateEnum
CREATE TYPE "EasingType" AS ENUM ('LINEAR', 'EASE_IN_OUT_CUBIC', 'EASE_IN_OUT_SINE', 'EASE_OUT_EXPONENTIAL', 'BEZIER', 'S_CURVE');

-- AlterTable
ALTER TABLE "cues" ADD COLUMN     "easing_type" "EasingType";
