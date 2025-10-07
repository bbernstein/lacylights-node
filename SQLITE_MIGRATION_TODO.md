# SQLite Migration Remaining Tasks

## Status
- ✅ Prisma schema updated to SQLite
- ✅ Enums converted to string types with application-layer validation
- ✅ Migration created and applied
- ✅ Helper functions created (src/utils/db-helpers.ts)
- ⚠️  Code updates needed for JSON array handling

## Files Requiring Updates

### High Priority (Breaking Compilation)

1. **src/graphql/resolvers/scene.ts**
   - Line 39: ExistingFixtureValue type needs update
   - Line 56: channelValues assignment needs JSON.stringify()
   - Use: `import { serializeChannelValues, parseChannelValues } from '../../utils/db-helpers'`

2. **src/graphql/resolvers/dmx.ts**
   - Line 96: value type mismatch
   - Parse channel values when reading from DB

3. **src/services/previewService.ts**
   - Line 172: value parameter type issue
   - Handle channelValues as JSON string

4. **src/graphql/resolvers/qlcExport.ts**
   - Line 195: channelValues.map() fails (it's now a string)
   - Use: `parseChannelValues(fixtureValue.channelValues).map(...)`

### Pattern for Updates

**Reading from database:**
```typescript
import { parseChannelValues } from '../utils/db-helpers';

// Old:
const values = fixtureValue.channelValues; // number[]

// New:
const values = parseChannelValues(fixtureValue.channelValues); // number[]
```

**Writing to database:**
```typescript
import { serializeChannelValues } from '../utils/db-helpers';

// Old:
await prisma.fixtureValue.create({
  data: {
    channelValues: [255, 128, 0], // number[]
  }
});

// New:
await prisma.fixtureValue.create({
  data: {
    channelValues: serializeChannelValues([255, 128, 0]), // string
  }
});
```

**Tags handling:**
```typescript
import { parseTags, serializeTags } from '../utils/db-helpers';

// Reading:
const tags = parseTags(fixture.tags); // string[]

// Writing:
await prisma.fixtureInstance.update({
  data: {
    tags: serializeTags(['stage-left', 'wash']), // string
  }
});
```

## Search Commands

Find all uses of channelValues:
```bash
grep -rn "channelValues" src --include="*.ts" | grep -v "test\|__tests__"
```

Find all uses of tags:
```bash
grep -rn "\.tags" src --include="*.ts" | grep -v "test\|__tests__"
```

## Type Definitions to Update

Create type aliases for database vs. application types:

```typescript
// src/types/database.ts
export type DbFixtureValue = {
  id: string;
  sceneId: string;
  fixtureId: string;
  channelValues: string; // JSON string in DB
  sceneOrder: number | null;
};

export type AppFixtureValue = {
  id: string;
  sceneId: string;
  fixtureId: string;
  channelValues: number[]; // Parsed array in app
  sceneOrder: number | null;
};
```

## Testing Strategy

1. Fix compilation errors first
2. Run unit tests: `npm test`
3. Run type checking: `npm run type-check`
4. Test GraphQL mutations for scenes and fixtures
5. Verify DMX output still works

## Rollback Plan

If issues arise:
```bash
# Restore PostgreSQL schema
git checkout main -- prisma/schema.prisma

# Remove SQLite database
rm dev.db dev.db-journal

# Recreate with PostgreSQL
npx prisma migrate reset
```

## Estimated Effort

- Core fixes: ~2-3 hours
- Testing: ~1 hour
- Total: ~3-4 hours

## Benefits

Once complete:
- ✅ No Docker dependency for development
- ✅ ~70% less memory usage (10-20MB vs 50-100MB)
- ✅ Simpler deployment to Raspberry Pi
- ✅ Single-file database (easy backups)
- ✅ Faster startup time
