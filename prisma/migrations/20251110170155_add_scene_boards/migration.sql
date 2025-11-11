-- CreateTable
CREATE TABLE "scene_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "default_fade_time" REAL NOT NULL DEFAULT 3.0,
    "grid_size" INTEGER DEFAULT 50,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scene_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scene_board_buttons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_board_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "layout_x" REAL NOT NULL,
    "layout_y" REAL NOT NULL,
    "width" REAL DEFAULT 0.1,
    "height" REAL DEFAULT 0.1,
    "color" TEXT,
    "label" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scene_board_buttons_scene_board_id_fkey" FOREIGN KEY ("scene_board_id") REFERENCES "scene_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scene_board_buttons_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "scene_board_buttons_scene_board_id_scene_id_key" ON "scene_board_buttons"("scene_board_id", "scene_id");
