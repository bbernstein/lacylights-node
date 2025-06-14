-- Convert all camelCase column names to snake_case

-- Users table
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";

-- Projects table  
ALTER TABLE "projects" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "projects" RENAME COLUMN "updatedAt" TO "updated_at";

-- Project users table
ALTER TABLE "project_users" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "project_users" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "project_users" RENAME COLUMN "joinedAt" TO "joined_at";

-- Fixture definitions table
ALTER TABLE "fixture_definitions" RENAME COLUMN "isBuiltIn" TO "is_built_in";
ALTER TABLE "fixture_definitions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "fixture_definitions" RENAME COLUMN "updatedAt" TO "updated_at";

-- Channel definitions table
ALTER TABLE "channel_definitions" RENAME COLUMN "minValue" TO "min_value";
ALTER TABLE "channel_definitions" RENAME COLUMN "maxValue" TO "max_value";
ALTER TABLE "channel_definitions" RENAME COLUMN "defaultValue" TO "default_value";
ALTER TABLE "channel_definitions" RENAME COLUMN "definitionId" TO "definition_id";

-- Fixture modes table
ALTER TABLE "fixture_modes" RENAME COLUMN "shortName" TO "short_name";
ALTER TABLE "fixture_modes" RENAME COLUMN "channelCount" TO "channel_count";
ALTER TABLE "fixture_modes" RENAME COLUMN "definitionId" TO "definition_id";

-- Mode channels table
ALTER TABLE "mode_channels" RENAME COLUMN "modeId" TO "mode_id";
ALTER TABLE "mode_channels" RENAME COLUMN "channelId" TO "channel_id";

-- Fixture instances table
ALTER TABLE "fixture_instances" RENAME COLUMN "definitionId" TO "definition_id";
ALTER TABLE "fixture_instances" RENAME COLUMN "modeId" TO "mode_id";
ALTER TABLE "fixture_instances" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "fixture_instances" RENAME COLUMN "startChannel" TO "start_channel";
ALTER TABLE "fixture_instances" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "fixture_instances" RENAME COLUMN "updatedAt" TO "updated_at";

-- Scenes table
ALTER TABLE "scenes" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "scenes" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "scenes" RENAME COLUMN "updatedAt" TO "updated_at";

-- Fixture values table
ALTER TABLE "fixture_values" RENAME COLUMN "sceneId" TO "scene_id";
ALTER TABLE "fixture_values" RENAME COLUMN "fixtureId" TO "fixture_id";

-- Channel values table
ALTER TABLE "channel_values" RENAME COLUMN "fixtureValueId" TO "fixture_value_id";
ALTER TABLE "channel_values" RENAME COLUMN "channelId" TO "channel_id";

-- Cue lists table
ALTER TABLE "cue_lists" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "cue_lists" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "cue_lists" RENAME COLUMN "updatedAt" TO "updated_at";

-- Cues table
ALTER TABLE "cues" RENAME COLUMN "cueNumber" TO "cue_number";
ALTER TABLE "cues" RENAME COLUMN "cueListId" TO "cue_list_id";
ALTER TABLE "cues" RENAME COLUMN "sceneId" TO "scene_id";
ALTER TABLE "cues" RENAME COLUMN "fadeInTime" TO "fade_in_time";
ALTER TABLE "cues" RENAME COLUMN "fadeOutTime" TO "fade_out_time";
ALTER TABLE "cues" RENAME COLUMN "followTime" TO "follow_time";
ALTER TABLE "cues" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "cues" RENAME COLUMN "updatedAt" TO "updated_at";

-- Preview sessions table
ALTER TABLE "preview_sessions" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "preview_sessions" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "preview_sessions" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "preview_sessions" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "preview_sessions" RENAME COLUMN "updatedAt" TO "updated_at";

-- Update constraints that reference the renamed columns

-- Drop old unique constraints
ALTER TABLE "project_users" DROP CONSTRAINT IF EXISTS "project_users_userId_projectId_key";
ALTER TABLE "fixture_instances" DROP CONSTRAINT IF EXISTS "fixture_instances_projectId_universe_startChannel_key";
ALTER TABLE "fixture_modes" DROP CONSTRAINT IF EXISTS "fixture_modes_definitionId_name_key";
ALTER TABLE "fixture_values" DROP CONSTRAINT IF EXISTS "fixture_values_sceneId_fixtureId_key";
ALTER TABLE "channel_values" DROP CONSTRAINT IF EXISTS "channel_values_fixtureValueId_channelId_key";
ALTER TABLE "mode_channels" DROP CONSTRAINT IF EXISTS "mode_channels_modeId_offset_key";
ALTER TABLE "cues" DROP CONSTRAINT IF EXISTS "cues_cueListId_cueNumber_key";
ALTER TABLE "preview_sessions" DROP CONSTRAINT IF EXISTS "preview_sessions_projectId_userId_key";

-- Recreate unique constraints with new column names
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_project_id_key" UNIQUE ("user_id", "project_id");
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_project_id_universe_start_channel_key" UNIQUE ("project_id", "universe", "start_channel");
ALTER TABLE "fixture_modes" ADD CONSTRAINT "fixture_modes_definition_id_name_key" UNIQUE ("definition_id", "name");
ALTER TABLE "fixture_values" ADD CONSTRAINT "fixture_values_scene_id_fixture_id_key" UNIQUE ("scene_id", "fixture_id");
ALTER TABLE "channel_values" ADD CONSTRAINT "channel_values_fixture_value_id_channel_id_key" UNIQUE ("fixture_value_id", "channel_id");
ALTER TABLE "mode_channels" ADD CONSTRAINT "mode_channels_mode_id_offset_key" UNIQUE ("mode_id", "offset");
ALTER TABLE "cues" ADD CONSTRAINT "cues_cue_list_id_cue_number_key" UNIQUE ("cue_list_id", "cue_number");
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_project_id_user_id_key" UNIQUE ("project_id", "user_id");

-- Drop old foreign key constraints and recreate with new column names

-- Project users foreign keys
ALTER TABLE "project_users" DROP CONSTRAINT IF EXISTS "project_users_userId_fkey";
ALTER TABLE "project_users" DROP CONSTRAINT IF EXISTS "project_users_projectId_fkey";
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Channel definitions foreign keys
ALTER TABLE "channel_definitions" DROP CONSTRAINT IF EXISTS "channel_definitions_definitionId_fkey";
ALTER TABLE "channel_definitions" ADD CONSTRAINT "channel_definitions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fixture modes foreign keys
ALTER TABLE "fixture_modes" DROP CONSTRAINT IF EXISTS "fixture_modes_definitionId_fkey";
ALTER TABLE "fixture_modes" ADD CONSTRAINT "fixture_modes_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mode channels foreign keys
ALTER TABLE "mode_channels" DROP CONSTRAINT IF EXISTS "mode_channels_modeId_fkey";
ALTER TABLE "mode_channels" DROP CONSTRAINT IF EXISTS "mode_channels_channelId_fkey";
ALTER TABLE "mode_channels" ADD CONSTRAINT "mode_channels_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "fixture_modes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mode_channels" ADD CONSTRAINT "mode_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fixture instances foreign keys
ALTER TABLE "fixture_instances" DROP CONSTRAINT IF EXISTS "fixture_instances_definitionId_fkey";
ALTER TABLE "fixture_instances" DROP CONSTRAINT IF EXISTS "fixture_instances_modeId_fkey";
ALTER TABLE "fixture_instances" DROP CONSTRAINT IF EXISTS "fixture_instances_projectId_fkey";
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "fixture_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "fixture_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fixture_instances" ADD CONSTRAINT "fixture_instances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Scenes foreign keys
ALTER TABLE "scenes" DROP CONSTRAINT IF EXISTS "scenes_projectId_fkey";
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fixture values foreign keys
ALTER TABLE "fixture_values" DROP CONSTRAINT IF EXISTS "fixture_values_sceneId_fkey";
ALTER TABLE "fixture_values" DROP CONSTRAINT IF EXISTS "fixture_values_fixtureId_fkey";
ALTER TABLE "fixture_values" ADD CONSTRAINT "fixture_values_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixture_values" ADD CONSTRAINT "fixture_values_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "fixture_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Channel values foreign keys
ALTER TABLE "channel_values" DROP CONSTRAINT IF EXISTS "channel_values_fixtureValueId_fkey";
ALTER TABLE "channel_values" DROP CONSTRAINT IF EXISTS "channel_values_channelId_fkey";
ALTER TABLE "channel_values" ADD CONSTRAINT "channel_values_fixture_value_id_fkey" FOREIGN KEY ("fixture_value_id") REFERENCES "fixture_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_values" ADD CONSTRAINT "channel_values_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cue lists foreign keys
ALTER TABLE "cue_lists" DROP CONSTRAINT IF EXISTS "cue_lists_projectId_fkey";
ALTER TABLE "cue_lists" ADD CONSTRAINT "cue_lists_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cues foreign keys
ALTER TABLE "cues" DROP CONSTRAINT IF EXISTS "cues_cueListId_fkey";
ALTER TABLE "cues" DROP CONSTRAINT IF EXISTS "cues_sceneId_fkey";
ALTER TABLE "cues" ADD CONSTRAINT "cues_cue_list_id_fkey" FOREIGN KEY ("cue_list_id") REFERENCES "cue_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cues" ADD CONSTRAINT "cues_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preview sessions foreign keys
ALTER TABLE "preview_sessions" DROP CONSTRAINT IF EXISTS "preview_sessions_projectId_fkey";
ALTER TABLE "preview_sessions" DROP CONSTRAINT IF EXISTS "preview_sessions_userId_fkey";
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;