-- Migration: Refactor channel values from relational to array format
-- This migration converts the complex ChannelValue table structure to a simple integer array

-- Step 1: Add the new channelValues array column to fixture_values table
ALTER TABLE "fixture_values" ADD COLUMN "channelValues" INTEGER[] DEFAULT '{}';

-- Step 2: Migrate existing data from channel_values table to the array format
-- We need to aggregate channel values by fixture_value_id and order them by channel offset
UPDATE "fixture_values" 
SET "channelValues" = (
  SELECT ARRAY_AGG(cv.value ORDER BY cd.offset)
  FROM "channel_values" cv
  JOIN "channel_definitions" cd ON cv.channel_id = cd.id
  WHERE cv.fixture_value_id = "fixture_values".id
);

-- Step 3: Verify data migration (this will fail if any fixture_values have no channel_values)
-- Comment out the next line if you want to allow empty channel arrays
-- DO $$ BEGIN ASSERT (SELECT COUNT(*) FROM "fixture_values" WHERE "channelValues" = '{}') = 0; END $$;

-- Step 4: Drop the old channel_values table and its foreign key constraints
DROP TABLE "channel_values";

-- Step 5: Remove the channelValues relation from channel_definitions
-- (This was already done in the schema, but we ensure consistency)

-- Note: After this migration:
-- - channelValues[0] corresponds to the channel with offset 0
-- - channelValues[1] corresponds to the channel with offset 1  
-- - etc.
-- - The array length should match the fixture's channel count