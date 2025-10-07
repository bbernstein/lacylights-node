-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "project_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fixture_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "channel_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "min_value" INTEGER NOT NULL DEFAULT 0,
    "max_value" INTEGER NOT NULL DEFAULT 255,
    "default_value" INTEGER NOT NULL DEFAULT 0,
    "definition_id" TEXT NOT NULL,
    CONSTRAINT "channel_definitions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fixture_modes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "channel_count" INTEGER NOT NULL,
    "definition_id" TEXT NOT NULL,
    CONSTRAINT "fixture_modes_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mode_channels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    CONSTRAINT "mode_channels_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "fixture_modes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mode_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel_definitions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fixture_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition_id" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "type" TEXT,
    "mode_name" TEXT,
    "channel_count" INTEGER,
    "project_id" TEXT NOT NULL,
    "universe" INTEGER NOT NULL,
    "start_channel" INTEGER NOT NULL,
    "tags" TEXT DEFAULT '[]',
    "project_order" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "fixture_instances_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixture_instances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scenes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fixture_values" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "fixture_id" TEXT NOT NULL,
    "channelValues" TEXT NOT NULL DEFAULT '[]',
    "scene_order" INTEGER,
    CONSTRAINT "fixture_values_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fixture_values_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixture_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "instance_channels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixture_id" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "min_value" INTEGER NOT NULL DEFAULT 0,
    "max_value" INTEGER NOT NULL DEFAULT 255,
    "default_value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "instance_channels_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixture_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cue_lists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cue_lists_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cue_number" REAL NOT NULL,
    "cue_list_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "fade_in_time" REAL NOT NULL DEFAULT 0,
    "fade_out_time" REAL NOT NULL DEFAULT 0,
    "follow_time" REAL,
    "easing_type" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cues_cue_list_id_fkey" FOREIGN KEY ("cue_list_id") REFERENCES "cue_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cues_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "preview_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "preview_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_users_user_id_project_id_key" ON "project_users"("user_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_definitions_manufacturer_model_key" ON "fixture_definitions"("manufacturer", "model");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_modes_definition_id_name_key" ON "fixture_modes"("definition_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "mode_channels_mode_id_offset_key" ON "mode_channels"("mode_id", "offset");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_instances_project_id_universe_start_channel_key" ON "fixture_instances"("project_id", "universe", "start_channel");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_values_scene_id_fixture_id_key" ON "fixture_values"("scene_id", "fixture_id");

-- CreateIndex
CREATE UNIQUE INDEX "instance_channels_fixture_id_offset_key" ON "instance_channels"("fixture_id", "offset");

-- CreateIndex
CREATE UNIQUE INDEX "cues_cue_list_id_cue_number_key" ON "cues"("cue_list_id", "cue_number");

-- CreateIndex
CREATE UNIQUE INDEX "preview_sessions_project_id_user_id_key" ON "preview_sessions"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
