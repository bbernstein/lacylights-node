-- AlterTable: Add canvas dimensions to scene_boards and convert button coordinates to pixels
-- This migration converts from normalized (0-1) coordinates to pixel-based coordinates

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Recreate scene_boards table with new canvas dimension columns
CREATE TABLE "new_scene_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "default_fade_time" REAL NOT NULL DEFAULT 3.0,
    "grid_size" INTEGER DEFAULT 50,
    "canvas_width" INTEGER NOT NULL DEFAULT 2000,
    "canvas_height" INTEGER NOT NULL DEFAULT 2000,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scene_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "new_scene_boards" ("id", "name", "description", "project_id", "default_fade_time", "grid_size", "created_at", "updated_at")
SELECT "id", "name", "description", "project_id", "default_fade_time", "grid_size", "created_at", "updated_at"
FROM "scene_boards";

DROP TABLE "scene_boards";
ALTER TABLE "new_scene_boards" RENAME TO "scene_boards";

-- Recreate scene_board_buttons table with integer coordinates
CREATE TABLE "new_scene_board_buttons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_board_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "layout_x" INTEGER NOT NULL,
    "layout_y" INTEGER NOT NULL,
    "width" INTEGER DEFAULT 200,
    "height" INTEGER DEFAULT 120,
    "color" TEXT,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scene_board_buttons_scene_board_id_fkey" FOREIGN KEY ("scene_board_id") REFERENCES "scene_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scene_board_buttons_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Convert existing data: multiply normalized (0-1) coordinates by canvas size (2000)
INSERT INTO "new_scene_board_buttons" ("id", "scene_board_id", "scene_id", "layout_x", "layout_y", "width", "height", "color", "label", "created_at", "updated_at")
SELECT
    "id",
    "scene_board_id",
    "scene_id",
    CAST(ROUND("layout_x" * 2000) AS INTEGER) as "layout_x",
    CAST(ROUND("layout_y" * 2000) AS INTEGER) as "layout_y",
    CASE WHEN "width" IS NOT NULL THEN CAST(ROUND("width" * 2000) AS INTEGER) ELSE 200 END as "width",
    CASE WHEN "height" IS NOT NULL THEN CAST(ROUND("height" * 2000) AS INTEGER) ELSE 120 END as "height",
    "color",
    "label",
    "created_at",
    "updated_at"
FROM "scene_board_buttons";

DROP TABLE "scene_board_buttons";
ALTER TABLE "new_scene_board_buttons" RENAME TO "scene_board_buttons";

-- Recreate unique index
CREATE UNIQUE INDEX "scene_board_buttons_scene_board_id_scene_id_key" ON "scene_board_buttons"("scene_board_id", "scene_id");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
