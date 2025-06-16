# Fixture Mode Flattening Refactor Plan

## Overview
Simplify the fixture/mode relationship by flattening mode information directly into FixtureInstance. This eliminates the need to reference both fixture and mode when working with fixtures in scenes.

## Current vs New Schema

### Current Schema (Complex)
```graphql
type FixtureInstance {
  id: ID!
  name: String!
  definition: FixtureDefinition!
  mode: FixtureMode         # <- Complex reference
  universe: Int!
  startChannel: Int!
}

type FixtureMode {
  id: ID!
  name: String!
  channelCount: Int!
  channels: [ModeChannel!]!
}
```

### New Schema (Simplified)
```graphql
type FixtureInstance {
  id: ID!
  name: String!
  description: String
  
  # Fixture Definition Info (for reference)
  definitionId: ID!
  manufacturer: String!
  model: String!
  type: FixtureType!
  
  # Flattened Mode Info (from selected mode)
  modeName: String!
  channelCount: Int!
  channels: [InstanceChannel!]!  # Direct channels for this instance
  
  # DMX Info
  universe: Int!
  startChannel: Int!
  tags: [String!]!
  
  # Metadata
  project: Project!
  createdAt: String!
}

type InstanceChannel {
  id: ID!
  offset: Int!              # Channel offset (0, 1, 2, 3...)
  name: String!             # "Red", "Green", "Blue", "Amber"
  type: ChannelType!
  minValue: Int!
  maxValue: Int!
  defaultValue: Int!
}
```

## Benefits of New Design

1. **Simplified Logic**: No more "if fixture.mode exists, use mode.channels, else..."
2. **Direct Access**: `fixtureInstance.channels[0]` instead of `fixtureInstance.mode.channels[0].channel`
3. **Clear Channel Count**: `fixtureInstance.channelCount` instead of checking mode
4. **Better Performance**: No complex joins needed
5. **Easier Frontend**: No GraphQL fragments for mode data

## Database Schema Changes

### New Prisma Schema
```prisma
model FixtureInstance {
  id           String @id @default(cuid())
  name         String
  description  String?
  
  // Fixture Definition Reference
  definitionId String @map("definition_id")
  manufacturer String  // Denormalized from definition
  model        String  // Denormalized from definition
  type         FixtureType // Denormalized from definition
  
  // Flattened Mode Information
  modeName     String @map("mode_name")
  channelCount Int    @map("channel_count")
  
  // DMX Configuration
  projectId    String @map("project_id")
  universe     Int
  startChannel Int    @map("start_channel")
  tags         String[] @default([])
  
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Relations
  definition    FixtureDefinition @relation(fields: [definitionId], references: [id])
  project       Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  channels      InstanceChannel[]
  fixtureValues FixtureValue[]

  @@unique([projectId, universe, startChannel])
  @@map("fixture_instances")
}

model InstanceChannel {
  id           String @id @default(cuid())
  fixtureId    String @map("fixture_id")
  offset       Int
  name         String
  type         ChannelType
  minValue     Int @default(0) @map("min_value")
  maxValue     Int @default(255) @map("max_value")
  defaultValue Int @default(0) @map("default_value")

  fixture FixtureInstance @relation(fields: [fixtureId], references: [id], onDelete: Cascade)

  @@unique([fixtureId, offset])
  @@map("instance_channels")
}

// Keep existing models but simplify usage
model FixtureDefinition {
  // ... existing fields
  instances FixtureInstance[]  // Remove complex mode relationship
}

// FixtureMode and ModeChannel remain for definition purposes only
model FixtureMode {
  // ... existing fields
  // Remove instances relation
}
```

## Implementation Plan

### Phase 1: Backend Schema Migration
1. **Create new tables**
   - Add `instance_channels` table
   - Add new fields to `fixture_instances`

2. **Data Migration Script**
   - For each existing FixtureInstance:
     - Copy mode.name to modeName
     - Copy mode.channelCount to channelCount
     - Copy manufacturer/model/type from definition
     - Create InstanceChannel records from mode.channels

3. **Update Prisma Schema**
   - Remove mode relation from FixtureInstance
   - Add new fields and InstanceChannel relation

### Phase 2: Backend Code Updates
1. **GraphQL Schema** (`src/graphql/schema.ts`)
   - Update FixtureInstance type
   - Add InstanceChannel type
   - Remove complex mode includes

2. **Resolvers** (`src/graphql/resolvers/`)
   - Simplify fixture resolvers
   - Update create/update mutations
   - Remove mode-related complexity

3. **Services** (if any)
   - Update fixture creation logic
   - Simplify channel access patterns

### Phase 3: Frontend Updates
1. **TypeScript Types** (`lacylights-fe/src/types/index.ts`)
   - Update FixtureInstance interface
   - Add InstanceChannel interface
   - Remove mode complexity

2. **GraphQL Queries** (`lacylights-fe/src/graphql/`)
   - Simplify fixture queries
   - Remove mode fragments
   - Direct channel access

3. **Components**
   - **CreateSceneModal**: Direct `fixture.channels` access
   - **SceneEditorModal**: Simplified channel logic
   - **AddFixtureModal**: Update to create flattened instances

### Phase 4: MCP Server Updates
1. **Update fixture tools** (`lacylights-mcp/src/tools/fixture-tools.ts`)
2. **Simplify scene creation** (`lacylights-mcp/src/tools/scene-tools.ts`)
3. **Update types** (`lacylights-mcp/src/types/lighting.ts`)

## Migration Strategy

### Step 1: Create Migration Script
```typescript
// migration: flatten_fixture_modes.ts
export async function up(prisma: PrismaClient) {
  // 1. Add new columns to fixture_instances
  await prisma.$executeRaw`
    ALTER TABLE fixture_instances 
    ADD COLUMN mode_name VARCHAR(255),
    ADD COLUMN channel_count INTEGER,
    ADD COLUMN manufacturer VARCHAR(255),
    ADD COLUMN model VARCHAR(255),
    ADD COLUMN type VARCHAR(50);
  `;

  // 2. Create instance_channels table
  await prisma.$executeRaw`
    CREATE TABLE instance_channels (
      id VARCHAR(30) PRIMARY KEY,
      fixture_id VARCHAR(30) NOT NULL,
      offset INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL,
      min_value INTEGER DEFAULT 0,
      max_value INTEGER DEFAULT 255,
      default_value INTEGER DEFAULT 0,
      FOREIGN KEY (fixture_id) REFERENCES fixture_instances(id) ON DELETE CASCADE
    );
  `;

  // 3. Migrate existing data
  const fixtures = await prisma.fixtureInstance.findMany({
    include: {
      definition: true,
      mode: {
        include: {
          modeChannels: {
            include: { channel: true },
            orderBy: { offset: 'asc' }
          }
        }
      }
    }
  });

  for (const fixture of fixtures) {
    // Update fixture instance with flattened data
    await prisma.fixtureInstance.update({
      where: { id: fixture.id },
      data: {
        modeName: fixture.mode?.name || 'Default',
        channelCount: fixture.mode?.channelCount || fixture.definition.channels.length,
        manufacturer: fixture.definition.manufacturer,
        model: fixture.definition.model,
        type: fixture.definition.type
      }
    });

    // Create instance channels
    const channels = fixture.mode?.modeChannels || 
      fixture.definition.channels.map((ch, idx) => ({
        offset: idx,
        channel: ch
      }));

    for (const modeChannel of channels) {
      await prisma.instanceChannel.create({
        data: {
          fixtureId: fixture.id,
          offset: modeChannel.offset,
          name: modeChannel.channel.name,
          type: modeChannel.channel.type,
          minValue: modeChannel.channel.minValue,
          maxValue: modeChannel.channel.maxValue,
          defaultValue: modeChannel.channel.defaultValue
        }
      });
    }
  }

  // 4. Remove old mode_id column
  await prisma.$executeRaw`ALTER TABLE fixture_instances DROP COLUMN mode_id;`;
}
```

### Step 2: Update Code Patterns

**Before (Complex)**:
```typescript
// Getting channels for a fixture
const channels = fixture.mode?.channels?.map(mc => mc.channel) || 
                 fixture.definition.channels;

// Channel count
const channelCount = fixture.mode?.channelCount || 
                     fixture.definition.channels.length;
```

**After (Simple)**:
```typescript
// Getting channels for a fixture
const channels = fixture.channels;

// Channel count
const channelCount = fixture.channelCount;
```

## Testing Strategy

1. **Unit Tests**: Test data migration script
2. **Integration Tests**: Verify fixture creation/editing
3. **E2E Tests**: Scene creation with flattened fixtures
4. **Performance Tests**: Compare query performance
5. **Data Integrity**: Verify all existing scenes still work

## Rollback Plan

1. Keep old schema alongside new for transition period
2. Migration script with `down()` function to reverse changes
3. Feature flags to switch between old/new implementations
4. Data validation to ensure consistency

## Timeline Estimate

- **Phase 1 (Backend Schema)**: 2-3 days
- **Phase 2 (Backend Code)**: 3-4 days  
- **Phase 3 (Frontend)**: 2-3 days
- **Phase 4 (MCP Server)**: 1-2 days
- **Testing & Polish**: 2-3 days

**Total**: 10-15 days for complete refactor

This refactor will significantly simplify the codebase and eliminate the mode-related confusion you're experiencing with the channel display issues.