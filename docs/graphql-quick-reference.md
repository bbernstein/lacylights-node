# GraphQL API Quick Reference

Quick reference guide for the LacyLights GraphQL API.

## Endpoint

**Development**: `http://localhost:4000/graphql`  
**Playground**: `http://localhost:4000/graphql` (interactive)

## Authentication

Development mode: No authentication required  
Production: JWT tokens (implementation pending)

## Common Queries

### Get All Projects
```graphql
query {
  projects {
    id
    name
    description
  }
}
```

### Get Project with Fixtures
```graphql
query GetProject($id: ID!) {
  project(id: $id) {
    name
    fixtures {
      id
      name
      universe
      startChannel
      definition {
        manufacturer
        model
      }
    }
  }
}
```

### Find Fixture Definitions
```graphql
query FindFixtures($filter: FixtureDefinitionFilter) {
  fixtureDefinitions(filter: $filter) {
    id
    manufacturer
    model
    type
    modes {
      name
      channelCount
    }
  }
}
```

### Get Scene Details
```graphql
query GetScene($id: ID!) {
  scene(id: $id) {
    name
    description
    fixtureValues {
      fixture {
        name
        startChannel
      }
      channelValues {
        channel {
          name
          type
        }
        value
      }
    }
  }
}
```

### Check DMX Output
```graphql
query GetDMX($universe: Int!) {
  dmxOutput(universe: $universe)
}
```

## Common Mutations

### Create Project
```graphql
mutation CreateProject($input: CreateProjectInput!) {
  createProject(input: $input) {
    id
    name
  }
}
```
Variables:
```json
{
  "input": {
    "name": "My Show",
    "description": "Concert lighting"
  }
}
```

### Add Fixture Instance
```graphql
mutation AddFixture($input: CreateFixtureInstanceInput!) {
  createFixtureInstance(input: $input) {
    id
    name
    universe
    startChannel
  }
}
```
Variables:
```json
{
  "input": {
    "name": "Stage Left Par",
    "definitionId": "fixture-def-id",
    "projectId": "project-id",
    "universe": 1,
    "startChannel": 1,
    "tags": ["par", "stage-left"]
  }
}
```

### Create Scene
```graphql
mutation CreateScene($input: CreateSceneInput!) {
  createScene(input: $input) {
    id
    name
  }
}
```
Variables:
```json
{
  "input": {
    "name": "Red Wash",
    "description": "Full red wash",
    "projectId": "project-id",
    "fixtureValues": [
      {
        "fixtureId": "fixture-id",
        "channelValues": [
          { "channelId": "red-channel-id", "value": 255 },
          { "channelId": "green-channel-id", "value": 0 },
          { "channelId": "blue-channel-id", "value": 0 }
        ]
      }
    ]
  }
}
```

### Set Channel Value
```graphql
mutation SetChannel($universe: Int!, $channel: Int!, $value: Int!) {
  setChannelValue(universe: $universe, channel: $channel, value: $value)
}
```
Variables:
```json
{
  "universe": 1,
  "channel": 1,
  "value": 255
}
```

### Activate Scene
```graphql
mutation ActivateScene($sceneId: ID!) {
  setSceneLive(sceneId: $sceneId)
}
```
Variables:
```json
{
  "sceneId": "scene-id"
}
```

## Subscriptions

### DMX Output Changes
```graphql
subscription {
  dmxOutputChanged {
    universe
    channels
  }
}
```

### DMX for Specific Universe
```graphql
subscription DMXUniverse($universe: Int!) {
  dmxOutputChanged(universe: $universe) {
    universe
    channels
  }
}
```

### Project Updates
```graphql
subscription ProjectChanges($projectId: ID!) {
  projectUpdated(projectId: $projectId) {
    id
    name
    fixtures {
      id
      name
    }
  }
}
```

## Useful Filters

### Find LED Par Fixtures
```json
{
  "filter": {
    "type": "LED_PAR",
    "channelTypes": ["RED", "GREEN", "BLUE"]
  }
}
```

### Find Chauvet Fixtures
```json
{
  "filter": {
    "manufacturer": "Chauvet DJ"
  }
}
```

### Find 4-Channel Fixtures
```json
{
  "filter": {
    "channelTypes": ["RED", "GREEN", "BLUE", "AMBER"]
  }
}
```

## DMX Channel Mapping

### SlimPAR Pro RGBA (4-channel mode)
- Channel 1: Red (0-255)
- Channel 2: Green (0-255) 
- Channel 3: Blue (0-255)
- Channel 4: Amber (0-255)

### Universe Layout
- Universe 1: Channels 1-512
- Universe 2: Channels 513-1024
- etc.

## Error Codes

- `VALIDATION_ERROR` - Invalid input
- `NOT_FOUND` - Resource doesn't exist
- `FORBIDDEN` - No permission
- `INTERNAL_SERVER_ERROR` - Server error

## HTTP Examples

### Using cURL
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { projects { id name } }"
  }'
```

### Using JavaScript fetch
```javascript
const response = await fetch('http://localhost:4000/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'query { projects { id name } }'
  })
});
const { data } = await response.json();
```

## WebSocket (Subscriptions)

### Using graphql-ws
```javascript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:4000/graphql',
});

client.subscribe(
  { query: 'subscription { dmxOutputChanged { universe channels } }' },
  {
    next: (data) => console.log('DMX Update:', data),
    error: (err) => console.error(err),
  }
);
```

## Testing Tools

### GraphQL Playground
Visit `http://localhost:4000/graphql` for interactive testing

### Schema Introspection
```bash
npm run introspect:schema
```

### Test Art-Net Output
```bash
npm run test:artnet
```

### Preview Scenes
```bash
npm run preview:scenes
```

## Data Types Reference

### Core IDs
- Projects: `cmbf6l3f40001v3iko37z67kw`
- Scenes: `cmbf76lq400019j2bwfh0fav5`
- Fixtures: `cmbf76lq400039j2bgba4t59i`

### Channel Types
- `INTENSITY`, `RED`, `GREEN`, `BLUE`, `WHITE`, `AMBER`, `UV`
- `PAN`, `TILT`, `ZOOM`, `FOCUS`, `IRIS`, `GOBO`
- `COLOR_WHEEL`, `EFFECT`, `STROBE`, `MACRO`, `OTHER`

### Fixture Types
- `LED_PAR`, `MOVING_HEAD`, `STROBE`, `DIMMER`, `OTHER`

### Value Ranges
- DMX Values: 0-255
- Universe Numbers: 1-4 (configurable)
- Channel Numbers: 1-512 per universe
- Cue Numbers: Float (e.g., 1.0, 1.5, 2.0)

---

For complete documentation, see `docs/graphql-api.md`