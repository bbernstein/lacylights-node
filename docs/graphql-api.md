# GraphQL API Documentation

This document provides comprehensive documentation for the LacyLights GraphQL API. It's designed for client developers who need to integrate with the lighting control system.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Schema Types](#schema-types)
- [Queries](#queries)
- [Mutations](#mutations)
- [Subscriptions](#subscriptions)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Introspection](#introspection)

## Overview

**Base URL**: `http://localhost:4000/graphql` (development)  
**Protocol**: GraphQL over HTTP/WebSocket  
**Content-Type**: `application/json`

The API provides real-time lighting control with support for:
- Project and fixture management
- Scene creation and playback
- Cue list sequencing
- Live DMX output control
- Real-time subscriptions

## Authentication

Currently, the API operates without authentication in development mode. In production, implement JWT tokens or session-based authentication.

## Schema Types

### Core Types

#### Project
Represents a lighting project containing fixtures, scenes, and cue lists.

```graphql
type Project {
  id: ID!
  name: String!
  description: String
  createdAt: String!
  updatedAt: String!
  fixtures: [FixtureInstance!]!
  scenes: [Scene!]!
  cueLists: [CueList!]!
  users: [ProjectUser!]!
}
```

#### FixtureDefinition
Defines a type of lighting fixture with its capabilities and channel layout.

```graphql
type FixtureDefinition {
  id: ID!
  manufacturer: String!
  model: String!
  type: FixtureType!
  channels: [ChannelDefinition!]!
  modes: [FixtureMode!]!
  isBuiltIn: Boolean!
  createdAt: String!
}
```

#### FixtureMode
Represents an operating mode of a fixture (e.g., 4-channel, 7-channel).

```graphql
type FixtureMode {
  id: ID!
  name: String!
  shortName: String
  channelCount: Int!
  channels: [ModeChannel!]!
}
```

#### ModeChannel
Maps a channel definition to a specific offset within a fixture mode.

```graphql
type ModeChannel {
  id: ID!
  offset: Int!
  channel: ChannelDefinition!
}
```

#### ChannelDefinition
Defines a control channel (e.g., Red, Green, Blue, Intensity).

```graphql
type ChannelDefinition {
  id: ID!
  name: String!
  type: ChannelType!
  offset: Int!
  minValue: Int!
  maxValue: Int!
  defaultValue: Int!
}
```

#### FixtureInstance
A physical fixture instance placed in a project.

```graphql
type FixtureInstance {
  id: ID!
  name: String!
  definition: FixtureDefinition!
  project: Project!
  universe: Int!
  startChannel: Int!
  tags: [String!]!
  createdAt: String!
}
```

#### Scene
A lighting state with specific values for fixtures.

```graphql
type Scene {
  id: ID!
  name: String!
  description: String
  project: Project!
  fixtureValues: [FixtureValue!]!
  createdAt: String!
  updatedAt: String!
}
```

#### FixtureValue
Values for a specific fixture within a scene.

```graphql
type FixtureValue {
  id: ID!
  fixture: FixtureInstance!
  channelValues: [ChannelValue!]!
}
```

#### ChannelValue
A specific channel's value within a fixture.

```graphql
type ChannelValue {
  channel: ChannelDefinition!
  value: Int!
}
```

#### CueList
An ordered sequence of lighting cues.

```graphql
type CueList {
  id: ID!
  name: String!
  description: String
  project: Project!
  cues: [Cue!]!
  createdAt: String!
  updatedAt: String!
}
```

#### Cue
A single lighting cue with timing and scene reference.

```graphql
type Cue {
  id: ID!
  name: String!
  cueNumber: Float!
  scene: Scene!
  fadeInTime: Float!
  fadeOutTime: Float!
  followTime: Float
  notes: String
}
```

#### UniverseOutput
DMX output data for a universe.

```graphql
type UniverseOutput {
  universe: Int!
  channels: [Int!]!
}
```

### Enums

#### FixtureType
```graphql
enum FixtureType {
  LED_PAR
  MOVING_HEAD
  STROBE
  DIMMER
  OTHER
}
```

#### ChannelType
```graphql
enum ChannelType {
  INTENSITY
  RED
  GREEN
  BLUE
  WHITE
  AMBER
  UV
  PAN
  TILT
  ZOOM
  FOCUS
  IRIS
  GOBO
  COLOR_WHEEL
  EFFECT
  STROBE
  MACRO
  OTHER
}
```

#### UserRole
```graphql
enum UserRole {
  ADMIN
  USER
}
```

#### ProjectRole
```graphql
enum ProjectRole {
  OWNER
  EDITOR
  VIEWER
}
```

### Input Types

#### CreateProjectInput
```graphql
input CreateProjectInput {
  name: String!
  description: String
}
```

#### CreateFixtureInstanceInput
```graphql
input CreateFixtureInstanceInput {
  name: String!
  definitionId: ID!
  projectId: ID!
  universe: Int!
  startChannel: Int!
  tags: [String!]
}
```

#### CreateSceneInput
```graphql
input CreateSceneInput {
  name: String!
  description: String
  projectId: ID!
  fixtureValues: [FixtureValueInput!]!
}
```

#### FixtureValueInput
```graphql
input FixtureValueInput {
  fixtureId: ID!
  channelValues: [ChannelValueInput!]!
}
```

#### ChannelValueInput
```graphql
input ChannelValueInput {
  channelId: ID!
  value: Int!
}
```

#### FixtureDefinitionFilter
```graphql
input FixtureDefinitionFilter {
  manufacturer: String
  model: String
  type: FixtureType
  isBuiltIn: Boolean
  channelTypes: [ChannelType!]
}
```

## Queries

### projects
Get all projects.

```graphql
query GetProjects {
  projects {
    id
    name
    description
    fixtures {
      id
      name
      universe
      startChannel
    }
    scenes {
      id
      name
    }
  }
}
```

### project(id: ID!)
Get a specific project by ID.

```graphql
query GetProject($projectId: ID!) {
  project(id: $projectId) {
    id
    name
    description
    fixtures {
      id
      name
      definition {
        manufacturer
        model
      }
      universe
      startChannel
    }
    scenes {
      id
      name
      fixtureValues {
        fixture {
          name
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
}
```

### fixtureDefinitions(filter: FixtureDefinitionFilter)
Get fixture definitions with optional filtering.

```graphql
query GetFixtureDefinitions($filter: FixtureDefinitionFilter) {
  fixtureDefinitions(filter: $filter) {
    id
    manufacturer
    model
    type
    modes {
      name
      channelCount
      channels {
        offset
        channel {
          name
          type
        }
      }
    }
  }
}
```

### scene(id: ID!)
Get a specific scene by ID.

```graphql
query GetScene($sceneId: ID!) {
  scene(id: $sceneId) {
    id
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
          offset
        }
        value
      }
    }
  }
}
```

### dmxOutput(universe: Int!)
Get current DMX output for a specific universe.

```graphql
query GetDMXOutput($universe: Int!) {
  dmxOutput(universe: $universe)
}
```

### allDmxOutput
Get DMX output for all universes.

```graphql
query GetAllDMXOutput {
  allDmxOutput {
    universe
    channels
  }
}
```

## Mutations

### createProject
Create a new lighting project.

```graphql
mutation CreateProject($input: CreateProjectInput!) {
  createProject(input: $input) {
    id
    name
    description
  }
}
```

**Variables:**
```json
{
  "input": {
    "name": "My Lighting Show",
    "description": "Main stage lighting for concert"
  }
}
```

### createFixtureInstance
Add a fixture instance to a project.

```graphql
mutation CreateFixtureInstance($input: CreateFixtureInstanceInput!) {
  createFixtureInstance(input: $input) {
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
```

**Variables:**
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

### createScene
Create a new lighting scene.

```graphql
mutation CreateScene($input: CreateSceneInput!) {
  createScene(input: $input) {
    id
    name
    description
    fixtureValues {
      fixture {
        name
      }
      channelValues {
        channel {
          name
        }
        value
      }
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "name": "Warm Wash",
    "description": "Warm white wash across all fixtures",
    "projectId": "project-id",
    "fixtureValues": [
      {
        "fixtureId": "fixture-1-id",
        "channelValues": [
          {
            "channelId": "red-channel-id",
            "value": 255
          },
          {
            "channelId": "green-channel-id", 
            "value": 200
          },
          {
            "channelId": "blue-channel-id",
            "value": 100
          }
        ]
      }
    ]
  }
}
```

### setChannelValue
Set a specific DMX channel value.

```graphql
mutation SetChannelValue($universe: Int!, $channel: Int!, $value: Int!) {
  setChannelValue(universe: $universe, channel: $channel, value: $value)
}
```

**Variables:**
```json
{
  "universe": 1,
  "channel": 1,
  "value": 255
}
```

### setSceneLive
Activate a scene for live DMX output.

```graphql
mutation SetSceneLive($sceneId: ID!) {
  setSceneLive(sceneId: $sceneId)
}
```

**Variables:**
```json
{
  "sceneId": "scene-id"
}
```

## Subscriptions

### dmxOutputChanged
Subscribe to real-time DMX output changes.

```graphql
subscription DMXOutputChanged($universe: Int) {
  dmxOutputChanged(universe: $universe) {
    universe
    channels
  }
}
```

**Variables (optional):**
```json
{
  "universe": 1
}
```

### projectUpdated
Subscribe to project changes.

```graphql
subscription ProjectUpdated($projectId: ID!) {
  projectUpdated(projectId: $projectId) {
    id
    name
    fixtures {
      id
      name
    }
    scenes {
      id
      name
    }
  }
}
```

## Usage Examples

### Complete Workflow Example

Here's a complete example of setting up a lighting project:

```graphql
# 1. Create a project
mutation CreateProject {
  createProject(input: {
    name: "Concert Main Stage"
    description: "Main stage lighting for rock concert"
  }) {
    id
    name
  }
}

# 2. Find fixture definitions
query FindLEDPars {
  fixtureDefinitions(filter: {
    manufacturer: "Chauvet DJ"
    model: "SlimPAR Pro RGBA"
  }) {
    id
    manufacturer
    model
    modes {
      id
      name
      channelCount
    }
  }
}

# 3. Add fixture instances
mutation AddFixtures($projectId: ID!, $definitionId: ID!) {
  fixture1: createFixtureInstance(input: {
    name: "Stage Left Par"
    definitionId: $definitionId
    projectId: $projectId
    universe: 1
    startChannel: 1
    tags: ["par", "stage-left"]
  }) {
    id
    name
  }
  
  fixture2: createFixtureInstance(input: {
    name: "Stage Right Par"
    definitionId: $definitionId
    projectId: $projectId
    universe: 1
    startChannel: 5
    tags: ["par", "stage-right"]
  }) {
    id
    name
  }
}

# 4. Create a scene
mutation CreateWarmWash($projectId: ID!, $fixture1Id: ID!, $fixture2Id: ID!) {
  createScene(input: {
    name: "Warm Wash"
    description: "Warm white wash across stage"
    projectId: $projectId
    fixtureValues: [
      {
        fixtureId: $fixture1Id
        channelValues: [
          { channelId: "red-channel-id", value: 255 }
          { channelId: "green-channel-id", value: 200 }
          { channelId: "blue-channel-id", value: 100 }
          { channelId: "amber-channel-id", value: 150 }
        ]
      }
      {
        fixtureId: $fixture2Id
        channelValues: [
          { channelId: "red-channel-id", value: 255 }
          { channelId: "green-channel-id", value: 200 }
          { channelId: "blue-channel-id", value: 100 }
          { channelId: "amber-channel-id", value: 150 }
        ]
      }
    ]
  }) {
    id
    name
  }
}

# 5. Activate the scene
mutation ActivateScene($sceneId: ID!) {
  setSceneLive(sceneId: $sceneId)
}
```

### Real-time Monitoring

```javascript
// WebSocket subscription for real-time DMX monitoring
const subscription = `
  subscription {
    dmxOutputChanged {
      universe
      channels
    }
  }
`;

// Using graphql-ws or similar WebSocket client
const client = createClient({
  url: 'ws://localhost:4000/graphql',
});

client.subscribe(
  { query: subscription },
  {
    next: (data) => {
      console.log('DMX Update:', data);
      // Update your UI with new channel values
    },
    error: (err) => console.error('Subscription error:', err),
    complete: () => console.log('Subscription complete'),
  }
);
```

## Error Handling

The API returns standard GraphQL errors with detailed messages:

```json
{
  "errors": [
    {
      "message": "Scene with ID abc123 not found",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": ["setSceneLive"],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": null
}
```

Common error codes:
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource doesn't exist
- `FORBIDDEN` - Insufficient permissions
- `INTERNAL_SERVER_ERROR` - Server-side error

## Introspection

Use GraphQL introspection to explore the schema:

```graphql
query IntrospectSchema {
  __schema {
    types {
      name
      kind
      description
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }
}
```

Get available queries:
```graphql
query AvailableQueries {
  __schema {
    queryType {
      fields {
        name
        description
        args {
          name
          type {
            name
          }
        }
      }
    }
  }
}
```

## Rate Limiting

Currently no rate limiting is implemented. In production, consider implementing:
- Query complexity analysis
- Rate limiting by IP or user
- Timeout protection for long-running queries

## Development Tools

### GraphQL Playground
Access the interactive GraphQL Playground at:
`http://localhost:4000/graphql`

Features:
- Schema explorer
- Query autocompletion
- Real-time query testing
- Subscription testing

### Example Client Code

#### JavaScript/TypeScript
```javascript
// Using fetch API
async function queryProjects() {
  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query {
          projects {
            id
            name
            fixtures {
              id
              name
            }
          }
        }
      `
    }),
  });

  const { data, errors } = await response.json();
  
  if (errors) {
    throw new Error(errors[0].message);
  }
  
  return data.projects;
}
```

#### Using Apollo Client
```javascript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
});

const GET_PROJECTS = gql`
  query GetProjects {
    projects {
      id
      name
      fixtures {
        id
        name
        universe
        startChannel
      }
    }
  }
`;

const { loading, error, data } = useQuery(GET_PROJECTS);
```

## Support

For questions about the GraphQL API:
1. Check this documentation
2. Use the GraphQL Playground for experimentation
3. Open issues on the project repository
4. Review the source code in `src/graphql/`

---

**Last Updated**: December 2024  
**API Version**: 1.0  
**GraphQL Specification**: 16.8.1