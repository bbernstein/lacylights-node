# Stage Lighting Control System: Product Requirements Document

## 1. Introduction

### 1.1 Purpose

This document outlines the requirements and design specifications for a comprehensive Stage Lighting Control System. The system is designed to manage DMX-based lighting fixtures, scenes, cue lists, and provide multi-user capabilities through a GraphQL API backend.

### 1.2 Scope

The Stage Lighting Control System will enable lighting designers and operators to:

- Define and manage lighting fixtures from standard libraries
- Create, edit, and store lighting scenes
- Organize scenes into cue lists for sequential playback
- Preview lighting changes in real-time before committing
- Collaborate with multiple users with different permission levels
- Control physical DMX lighting fixtures through standard protocols

### 1.3 Definitions and Acronyms

| Term               | Definition                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighting Project   | A complete instance of a project, including Fixture Types, Fixture Sets, Scenes, and Cue Lists.                                                                                                                               |
| DMX                | Digital Multiplex - control protocol for lighting fixtures                                                                                                                                                                    |
| Fixture Definition | Detailed specs for a type of fixture as defined by [Open Fixture Library](https://open-fixture-library.org/) in [JSON Format](https://github.com/OpenLightingProject/open-fixture-library/blob/master/docs/fixture-format.md) |
| Fixture Type       | A local instance of a Fixture Definition, which is a copy of the Fixture Definition stored with a lighting project                                                                                                            |
| Fixture Set        | A named reference to a Fixture Type and a specific mode of that Fixture Type. All fixtures are part of a Fixture Set and must have the same number of associated channels                                                     |
| Fixture            | A physical lighting instrument controlled via DMX, associated with a Universe and a starting channel                                                                                                                          |
| Scene              | A set of fixtures and fixture groups associated DMX channel values for those fixture and groups of fixtures                                                                                                                   |
| Fixture Group      | A group of fixtures that are addressed as a group for changing channel values of all the fixtures in the group with a single operations. These only exist within scenes                                                       |
| Cue                | A scene with associated timing information such as fades and durations                                                                                                                                                        |
| Cue List           | A sequence of cues that can be played back in order                                                                                                                                                                           |
| Universe           | A set of 512 DMX channels                                                                                                                                                                                                     |
| Preview            | A set of DMX values sent to the devices without saving them to a model                                                                                                                                                        |

## 2. System Architecture

### 2.1 High-Level Architecture

The system will follow a client-server architecture:

- Backend: GraphQL API server with subscription support
- DMX Output Service: Handles real-time DMX protocol communication
- Database: Stores project, fixture, scene, and user data
- Frontend(s): Multiple client applications can connect to the backend

### 2.2 Technology Stack

- Backend: Rust
- Database: Sqlite
- API: GraphQL
- DMX Protocol: Support for ArtNet with future support for sACN, and direct USB DMX interfaces

## 3. Data Model

### 3.1 Core Entities

#### 3.1.1 Project

The top-level container for all lighting resources.

```graphql
type Project {
  id: ID!
  name: String!
  description: String
  fixtureTypes: [FixtureType!]!
  fixtures: [Fixture!]!
  scenes: [Scene!]!
  cueLists: [CueList!]!
  users: [ProjectUser!]!
  settings: ProjectSettings!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type ProjectSettings {
  defaultTimings: CueTiming
  defaultUniverseCount: Int!
  outputMappings: [OutputMapping!]!
}
```

#### 3.1.2 Fixture Definition System

```graphql
type FixtureDefinition {
  id: ID!
  manufacturer: String!
  model: String!
  availableChannels: [AvailableChannel!]!
  modes: [FixtureMode!]!
  physical: PhysicalAttributes
  bulbAttributes: BulbAttributes
  lensAttributes: LensAttributes
  matrixConfiguration: MatrixConfiguration
}

type AvailableChannel {
  name: String!
  capabilities: [ChannelCapability!]!
}

type ChannelCapability {
  dmxRange: DMXRange!
  type: String!
  effect: String
  parameters: [CapabilityParameter!]
}

type FixtureMode {
  name: String!
  shortName: String
  channels: [String!]! # References to available channels
}

type FixtureType {
  id: ID!
  project: Project!
  definition: FixtureDefinition!
  customName: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type FixtureSet {
  id: ID!
  name: String!
  project: Project!
  fixtureType: FixtureType!
  selectedMode: FixtureMode!
}
```

#### 3.1.3 Fixture Instance

```graphql
type Fixture {
  id: ID!
  project: Project!
  name: String!
  fixtureSet: FixtureSet!
  universe: Int!
  startChannel: Int!
  channels: [FixtureChannel!]!
  notes: String
  position: Position
  createdAt: DateTime!
  updatedAt: DateTime!
}

type FixtureChannel {
  index: Int! # Relative to fixture start channel
  name: String!
  absoluteAddress: Int! # Calculated from fixture.startChannel + index
}

type Position {
  x: Float
  y: Float
  z: Float
  rotation: Float
}
```

#### 3.1.4 Scene Management

```graphql
type Scene {
  id: ID!
  project: Project!
  name: String!
  fixtureValues: [FixtureValueSet!]!
  notes: String
  tags: [String!]
  createdAt: DateTime!
  updatedAt: DateTime!
}

type FixtureValueSet {
  fixtureId: ID!
  channelValues: [Int!]!
}
```

#### 3.1.5 Cue Lists

```graphql
type CueList {
  id: ID!
  project: Project!
  name: String!
  cues: [Cue]!
  isChaser: Boolean! # Whether it loops automatically
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Cue {
  id: ID!
  name: String!
  sceneId: ID!
  scene: Scene!
  timing: CueTiming!
}

type CueTiming {
  fadeInTime: Float! # Seconds
  holdTime: Float! # Seconds, -1 for infinite
}
```

#### 3.1.6 User Management

```graphql
type User {
  id: ID!
  username: String!
  email: String!
  profile: UserProfile!
  projects: [ProjectUser!]!
}

type UserProfile {
  displayName: String
  avatarUrl: String
  preferences: UserPreferences
}

type ProjectUser {
  project: Project!
  user: User!
  role: Role!
  joinedAt: DateTime!
}

enum Role {
  ADMIN # Full control
  EDITOR # Can edit fixtures, scenes, etc.
  OPERATOR # Can run shows but not edit
  VIEWER # Read-only access
}
```

#### 3.1.7 Preview System

```graphql
type PreviewSession {
  id: ID!
  project: Project!
  user: User!
  activeSceneId: ID
  temporaryValues: [FixtureValueSetPreview!]!
  createdAt: DateTime!
  lastActive: DateTime!
}

type FixtureValueSetPreview {
  fixtureId: ID!
  channelValues: [Int!]!
}
```

### 3.2 Relationships

- Project contains all other entities
- A FixtureDefinition is a representation of a fixture defined in the Open Fixture Library.
- FixtureTypes include a copy of a FixtureDefinition with a reference to unique identifier of the fixture definition in Open Fixture Library
- FixtureSets reference FixtureTypes
- Fixtures reference FixtureSets
- Scenes contain FixtureValueSets which are a set of values for each of the channels in each Fixture in the Scene
- CueLists contain Cues that reference Scenes
- Users have access to Projects through ProjectUser join table
- PreviewSessions reference a Project and contain temporary values for a set of channels in a set of fixtures

## 4. Feature Requirements

### 4.1 Fixture Management

#### 4.1.1 Fixture Library

- System shall import and store standard fixture definitions from Open Fixture Library
  - These values may be imported from local files or from http requests
- Support for browsing and searching fixture definitions by manufacturer, model, etc.
- Detailed fixture information including channels, capabilities, and physical attributes

#### 4.1.2 Local Fixture Types

- Create local copies of fixture definitions as FixtureTypes
- Assign custom names to fixture types for easier reference
- Maintain backward compatibility if original definitions change

#### 4.1.3 Fixture Sets

- Create FixtureSets that represent a FixtureType and FixtureMode.
- There should be only one FixtureSet for any unique pair of FixtureType/FixtureMode
- FixtureSets can get a default name that is a combination of unique identifiers for the fixture definition manufacturer, model, and mode
- A FixtureSet can be created with a name, but the name must be unique

#### 4.1.4 Fixture Instances

- Create fixture instances with unique names
- The default name should be the FixtureSet name with an incrementing number
- Assign DMX universe and starting channel
- Automatically validate to prevent channel overlaps
- Optionally store position information for visualization

### 4.2 Scene Management

#### 4.2.1 Scene Creation

- Create named scenes with specific fixtures and channel values for each of the channels in each fixture
- Set DMX values (0-255) for any channel of any fixture
- Store metadata and notes

#### 4.2.2 Scene Editing

- Update fixture channel values within scenes
- Add or remove fixtures from scenes
- Copy scenes to create variations

#### 4.2.3 Scene Preview

- Live preview changes before storing in the model
- Allows interactive adjustments with immediate DMX output
- Prevent unintentional saves during rapid adjustments (e.g., color picker)

### 4.3 Cue Lists

#### 4.3.1 Cue Creation

- Create and name cues referencing scenes
- Set timing parameters (fade-in, hold time)

#### 4.3.2 Cue List Management

- Create sequences of cues
- Reorder cues within lists
- Set loop behavior for chasers

#### 4.3.3 Cue Playback

- Manual or automatic advancement of cues
- Real-time fading between scenes
- Status monitoring of active cues
- Pause and resume functionality

### 4.4 Preview System

#### 4.4.1 Preview Sessions

- Create temporary editing sessions
- Update DMX values in real-time without saving to scenes
- Support high-frequency updates (e.g., color pickers, faders)

#### 4.4.2 Preview Commitment

- Selectively save preview values to scenes
- Discard preview changes
- Auto-expire inactive preview sessions

### 4.5 Project Management

#### 4.5.1 Project Creation

- Create named projects to organize lighting setups
- Configure project settings (universes, default timings)
- Import/export project data

#### 4.5.2 Multi-User Collaboration

- Share projects with multiple users
- Assign different access roles (admin, editor, operator, viewer)
- Track changes and user actions

#### 4.5.3 Localhost Access

- When in development mode, all access can be assumed from an admin user
- Development mode can be set by a configuration or access from localhost or specified ip address
- No authentication or signin needed when accessed in development mode

### 4.6 DMX Output

#### 4.6.1 Output Protocols

- Support for Art-Net DMX protocols (future updates for sACN, USB DMX)
- Configure output mappings for universes
- Real-time DMX value calculation based on priority system

#### 4.6.2 Priority System

- Preview values override scene values
- Active cues take precedence over inactive ones
- Fall back to default values when necessary
- Fall back to zero values when no defaults are known

## 5. API Design

### 5.1 GraphQL Schema

#### 5.1.1 Main Types

- Project, Fixture, Scene, CueList, User, PreviewSession
- Supporting types for all object properties

#### 5.1.2 Queries

```graphql
type Query {
  # Project access
  projects: [Project!]!
  project(id: ID!): Project
  userProjects: [Project!]!

  # Fixture definitions
  fixtureDefinitions(manufacturer: String, model: String): [FixtureDefinition!]!
  fixtureDefinition(id: ID!): FixtureDefinition

  # Project-scoped queries
  fixtureTypes: [FixtureType!]!
  fixtureType(id: ID!): FixtureType

  fixtureSets: [FixtureSet!]!
  fixtureSet(id: ID!): FixtureSet

  fixtures(projectId: ID!): [Fixture!]!
  fixture(id: ID!): Fixture

  scenes(projectId: ID!, tags: [String!]): [Scene!]!
  scene(id: ID!): Scene

  cueLists(projectId: ID!): [CueList!]!
  cueList(id: ID!): CueList

  # User management
  users: [User!]!
  user(id: ID!): User
  me: User

  # Preview sessions
  activeSessions(projectId: ID!): [PreviewSession!]!
  previewSession(id: ID!): PreviewSession
}
```

#### 5.1.3 Mutations

```graphql
type Mutation {
  # Project management
  createProject(input: CreateProjectInput!): Project!
  updateProject(id: ID!, input: UpdateProjectInput!): Project!
  deleteProject(id: ID!): Boolean!

  # User access
  addUserToProject(projectId: ID!, userId: ID!, role: Role!): ProjectUser!
  updateUserRole(projectId: ID!, userId: ID!, role: Role!): ProjectUser!
  removeUserFromProject(projectId: ID!, userId: ID!): Boolean!

  # Fixture management
  createFixtureType(
    projectId: ID!
    definitionId: ID!
    customName: String
  ): FixtureType!

  deleteFixtureType(id: ID!): Boolean!

  createFixtureSet(
    projectId: ID!
    typeId: ID!
    modeId: ID!
    customName: String
  ): FixtureSet!

  deleteFixtureSet(id: ID!): Boolean!

  createFixture(
    projectId: ID!
    setId: ID!
    name: String!
    universe: Int!
    startChannel: Int!
  ): Fixture!

  updateFixture(
    id: ID!
    name: String
    universe: Int
    startChannel: Int
  ): Fixture!

  deleteFixture(id: ID!): Boolean!

  # Scene management
  createScene(
    projectId: ID!
    name: String!
    fixtureValues: [FixtureValueSet!]!
  ): Scene!

  updateScene(id: ID!, name: String, fixtureValues: [FixtureValueSet!]): Scene!

  deleteScene(id: ID!): Boolean!

  # Cue list management
  createCueList(projectId: ID!, name: String!, isChaser: Boolean): CueList!

  addCue(
    cueListId: ID!
    sceneId: ID!
    timing: CueTimingInput!
    name: String!
  ): Cue!

  updateCue(id: ID!, sceneId: ID, timing: CueTimingInput, name: String): Cue!

  reorderCues(cueListId: ID!, cueIds: [ID!]!): CueList!

  # Preview system
  startPreviewSession(projectId: ID!, baseSceneId: ID): PreviewSession!

  updatePreviewValues(sessionId: ID!, values: [FixtureValueSet!]!): Boolean!

  commitPreviewToScene(
    sessionId: ID!
    sceneId: ID!
    channelSelection: [ChannelSelection!]
  ): Scene!

  endPreviewSession(sessionId: ID!): Boolean!

  # DMX control
  activateCueList(id: ID!): Boolean!
  triggerNextCue(cueListId: ID!): Cue!
  stopCueList(id: ID!): Boolean!
}
```

#### 5.1.4 Subscriptions

```graphql
type Subscription {
  # DMX output monitoring
  dmxValuesChanged(
    projectId: ID!
    universe: Int
    channelRange: DMXRange
  ): [DMXChannelValue!]!

  # Preview updates
  previewValuesChanged(projectId: ID!): [ChannelPreviewValue!]!

  # Cue tracking
  cueTriggered(projectId: ID!, cueListId: ID!): Cue!

  # User activity
  userActivity(projectId: ID!): UserAction!
}
```

### 5.2 Authorization Model

#### 5.2.1 Permission Matrix

| Action                   | Admin | Editor | Operator | Viewer |
| ------------------------ | ----- | ------ | -------- | ------ |
| View project             | ✓     | ✓      | ✓        | ✓      |
| Create/edit fixtures     | ✓     | ✓      | -        | -      |
| Create/edit scenes       | ✓     | ✓      | -        | -      |
| Create/edit cue lists    | ✓     | ✓      | -        | -      |
| Run preview sessions     | ✓     | ✓      | ✓        | -      |
| Trigger cues             | ✓     | ✓      | ✓        | -      |
| Manage users             | ✓     | -      | -        | -      |
| Delete project resources | ✓     | -      | -        | -      |

#### 5.2.2 Implementation

- JWT-based authentication
- Project-scoped authorization checks in resolvers
- Role-based access control for all mutations
- Activity logging for audit purposes

## 6. DMX Output System

### 6.1 DMX Value Priority

1. Preview sessions (highest priority)
2. Active cues/scenes (medium priority)
3. Default/home values (lowest priority)

### 6.2 DMX Output Service Architecture

```
+----------------+   +----------------+   +----------------+
| GraphQL Server |-->| DMX Calculator |-->| Protocol Layer |
+----------------+   +----------------+   +----------------+
        |                                         |
        v                                         v
+----------------+                     +------------------+
| Database       |                     | Physical Outputs |
+----------------+                     +------------------+
```

### 6.3 Performance Requirements

- Support minimum of 4 universes (2048 channels)
- Maximum latency of 50ms from value change to DMX output
- Support for 44Hz DMX refresh rate
- Optimized batching for high-frequency updates

## 7. Client Requirements

### 7.1 Client Capabilities

- Connect to backend via GraphQL
- Authenticate users and manage sessions
- Display fixtures, scenes, and cue lists
- Provide UI for editing fixtures and scenes
- Real-time preview of lighting changes
- Visual cue list playback interface
- Support for color pickers and other interactive controls

### 7.2 Client Optimization

- Debounce high-frequency control changes
- Batch GraphQL updates
- Maintain local state for preview sessions
- Clear visual indicators for preview mode

## 8. Deployment and Environment

### 8.1 System Requirements

- Node.js 16+ for backend
- PostgreSQL 13+ or MongoDB 5+ for database
- Network infrastructure supporting WebSockets
- DMX interfaces for physical output

### 8.2 Scaling Considerations

- Horizontal scaling for multiple DMX universes
- Database partitioning for large projects
- Real-time performance monitoring

## 9. Future Considerations

### 9.1 Potential Extensions

- Timeline-based programming
- Support for MIDI and OSC input triggers
- Visualization of lighting in 3D space
- Integration with media servers
- Mobile control applications
- Show recording and playback
- Hardware console integration

## 10. Development Roadmap

### 10.1 Phase 1: Core Framework

- Project and user management
- Fixture definition system
- Basic scene creation
- GraphQL API foundation

### 10.2 Phase 2: DMX Control

- DMX output service
- Preview system
- Cue list functionality
- Real-time subscriptions

### 10.3 Phase 3: Advanced Features

- Multi-user collaboration
- Extended fixture capabilities
- Performance optimizations
- Client application development

# Appendix A: GraphQL Schema

```graphql
# Scalar types
scalar DateTime
scalar JSON

# Enums
enum Role {
  ADMIN
  EDITOR
  OPERATOR
  VIEWER
}

enum TriggerType {
  AUTO
  MANUAL
  FOLLOW
  TIMECODE
}

enum CapabilityType {
  Intensity
  ShutterStrobe
  ColorIntensity
  ColorPreset
  Pan
  Tilt
  Focus
  Zoom
  Prism
  Gobo
  Rotation
  Effect
  Maintenance
  Speed
  Time
  NoFunction
  Generic
}

enum BulbType {
  LED
  Halogen
  Discharge
  Other
}

# Input types
input CreateProjectInput {
  name: String!
  description: String
  defaultUniverseCount: Int
}

input UpdateProjectInput {
  name: String
  description: String
  defaultUniverseCount: Int
}

input DMXRange {
  start: Int!
  end: Int!
}

input ChannelValueInput {
  fixtureId: ID!
  channelIndex: Int!
  value: Int!
}

input CueTimingInput {
  fadeInTime: Float!
  holdTime: Float!
}

input ChannelSelection {
  fixtureId: ID!
  channelIndices: [Int!]!
}

input PositionInput {
  x: Float
  y: Float
  z: Float
  rotation: Float
}

input OutputMappingInput {
  universe: Int!
  protocol: String!
  destination: String!
  port: Int
}

# Core types
type Project {
  id: ID!
  name: String!
  description: String
  fixtureTypes: [FixtureType!]!
  fixtures: [Fixture!]!
  scenes: [Scene!]!
  cueLists: [CueList!]!
  users: [ProjectUser!]!
  settings: ProjectSettings!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type ProjectSettings {
  defaultTimings: CueTiming
  defaultUniverseCount: Int!
  outputMappings: [OutputMapping!]!
}

type OutputMapping {
  universe: Int!
  protocol: String!
  destination: String!
  port: Int
}

# Fixture Definition System
type FixtureDefinition {
  id: ID!
  manufacturer: String!
  model: String!
  availableChannels: [AvailableChannel!]!
  modes: [FixtureMode!]!
  physical: PhysicalAttributes
  bulbAttributes: BulbAttributes
  lensAttributes: LensAttributes
  matrixConfiguration: MatrixConfiguration
  tags: [String!]
  createDate: DateTime!
  lastModifiedDate: DateTime!
}

type AvailableChannel {
  name: String!
  capabilities: [ChannelCapability!]!
  defaultValue: Int
}

type ChannelCapability {
  dmxRange: DMXRange!
  type: CapabilityType!
  effect: String
  effectName: String
  colors: [String!]
  parameters: JSON
}

type DMXRange {
  start: Int!
  end: Int!
}

type FixtureMode {
  id: ID!
  name: String!
  shortName: String
  channels: [String!]!
  channelCount: Int!
}

type PhysicalAttributes {
  width: Float
  height: Float
  depth: Float
  weight: Float
  power: Float
  DMXconnector: String
}

type BulbAttributes {
  type: BulbType
  colorTemperature: Int
  lumens: Int
  power: Int
}

type LensAttributes {
  degreesMin: Float
  degreesMax: Float
  name: String
}

type MatrixConfiguration {
  pixelCount: [Int!]
  pixelGroups: JSON
}

type FixtureType {
  id: ID!
  project: Project!
  definition: FixtureDefinition!
  selectedMode: FixtureMode!
  customName: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# Fixture instances
type Fixture {
  id: ID!
  project: Project!
  name: String!
  fixtureType: FixtureType!
  universe: Int!
  startChannel: Int!
  channels: [FixtureChannel!]!
  notes: String
  position: Position
  createdAt: DateTime!
  updatedAt: DateTime!
}

type FixtureChannel {
  index: Int!
  name: String!
  absoluteAddress: Int!
  capability: ChannelCapability
}

type Position {
  x: Float
  y: Float
  z: Float
  rotation: Float
}

# Scene Management
type Scene {
  id: ID!
  project: Project!
  name: String!
  channelValues: [ChannelValue!]!
  notes: String
  tags: [String!]
  createdAt: DateTime!
  updatedAt: DateTime!
}

type ChannelValue {
  fixtureId: ID!
  fixture: Fixture!
  channelIndex: Int!
  value: Int!
}

# Cue Management
type CueList {
  id: ID!
  project: Project!
  name: String!
  cues: [Cue!]!
  isChaser: Boolean!
  isActive: Boolean!
  currentCueId: ID
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Cue {
  id: ID!
  name: String!
  sceneId: ID!
  scene: Scene!
  timing: CueTiming!
  triggerType: TriggerType!
  nextCueId: ID
  nextCue: Cue
  index: Int!
}

type CueTiming {
  fadeInTime: Float!
  holdTime: Float!
}

# User Management
type User {
  id: ID!
  username: String!
  email: String!
  profile: UserProfile!
  projects: [ProjectUser!]!
  createdAt: DateTime!
}

type UserProfile {
  displayName: String
  avatarUrl: String
  preferences: UserPreferences
}

type UserPreferences {
  theme: String
  language: String
  dmxMonitorRefreshRate: Int
}

type ProjectUser {
  project: Project!
  user: User!
  role: Role!
  joinedAt: DateTime!
}

# Preview System
type PreviewSession {
  id: ID!
  project: Project!
  user: User!
  activeSceneId: ID
  temporaryValues: [ChannelPreviewValue!]!
  createdAt: DateTime!
  lastActive: DateTime!
  isActive: Boolean!
}

type ChannelPreviewValue {
  fixtureId: ID!
  fixture: Fixture!
  channelIndex: Int!
  value: Int!
}

# DMX Output Monitoring
type DMXChannelValue {
  universe: Int!
  channel: Int!
  value: Int!
  source: ValueSource!
}

enum ValueSource {
  PREVIEW
  ACTIVE_CUE
  DEFAULT
}

# User Activity Tracking
type UserAction {
  id: ID!
  user: User!
  actionType: String!
  targetType: String!
  targetId: ID!
  details: JSON
  timestamp: DateTime!
}

# Root Types
type Query {
  # Project access
  projects: [Project!]!
  project(id: ID!): Project
  userProjects: [Project!]!

  # Fixture definitions
  fixtureDefinitions(
    manufacturer: String
    model: String
    tags: [String!]
  ): [FixtureDefinition!]!
  fixtureDefinition(id: ID!): FixtureDefinition
  manufacturers: [String!]!
  fixtureDefinitionsByManufacturer(manufacturer: String!): [FixtureDefinition!]!

  # Project-scoped queries
  fixtures(projectId: ID!): [Fixture!]!
  fixture(id: ID!): Fixture

  fixtureTypes(projectId: ID!): [FixtureType!]!
  localFixtureType(id: ID!): FixtureType

  scenes(projectId: ID!, tags: [String!]): [Scene!]!
  scene(id: ID!): Scene

  cueLists(projectId: ID!): [CueList!]!
  cueList(id: ID!): CueList

  # User management
  users: [User!]!
  user(id: ID!): User
  me: User
  projectUsers(projectId: ID!): [ProjectUser!]!

  # Preview sessions
  activeSessions(projectId: ID!): [PreviewSession!]!
  previewSession(id: ID!): PreviewSession
  myActiveSessions: [PreviewSession!]!

  # DMX monitoring
  currentDMXValues(
    projectId: ID!
    universe: Int
    channelRange: DMXRange
  ): [DMXChannelValue!]!

  # Utilities
  validateFixtureAddressing(
    projectId: ID!
    universe: Int
    startChannel: Int
    channelCount: Int
    excludeFixtureId: ID
  ): Boolean!
}

type Mutation {
  # Authentication
  login(username: String!, password: String!): AuthPayload!
  refreshToken(token: String!): AuthPayload!

  # Project management
  createProject(input: CreateProjectInput!): Project!
  updateProject(id: ID!, input: UpdateProjectInput!): Project!
  deleteProject(id: ID!): Boolean!

  # Project settings
  updateProjectSettings(
    projectId: ID!
    settings: ProjectSettingsInput!
  ): ProjectSettings!

  addOutputMapping(projectId: ID!, mapping: OutputMappingInput!): OutputMapping!

  removeOutputMapping(projectId: ID!, universe: Int!): Boolean!

  # User access
  addUserToProject(projectId: ID!, userId: ID!, role: Role!): ProjectUser!

  updateUserRole(projectId: ID!, userId: ID!, role: Role!): ProjectUser!

  removeUserFromProject(projectId: ID!, userId: ID!): Boolean!

  # Local fixture types
  createFixtureType(
    projectId: ID!
    definitionId: ID!
    modeId: ID!
    customName: String
  ): FixtureType!

  updateFixtureType(id: ID!, customName: String): FixtureType!

  deleteFixtureType(id: ID!): Boolean!

  # Fixture management
  createFixture(
    projectId: ID!
    typeId: ID!
    name: String!
    universe: Int!
    startChannel: Int!
    position: PositionInput
  ): Fixture!

  updateFixture(
    id: ID!
    name: String
    universe: Int
    startChannel: Int
    position: PositionInput
  ): Fixture!

  deleteFixture(id: ID!): Boolean!

  # Scene management
  createScene(
    projectId: ID!
    name: String!
    channelValues: [ChannelValueInput!]!
    tags: [String!]
  ): Scene!

  updateScene(
    id: ID!
    name: String
    channelValues: [ChannelValueInput!]
    tags: [String!]
  ): Scene!

  deleteScene(id: ID!): Boolean!

  duplicateScene(id: ID!, newName: String!): Scene!

  # Cue list management
  createCueList(projectId: ID!, name: String!, isChaser: Boolean): CueList!

  updateCueList(id: ID!, name: String, isChaser: Boolean): CueList!

  deleteCueList(id: ID!): Boolean!

  addCue(
    cueListId: ID!
    sceneId: ID!
    timing: CueTimingInput!
    name: String!
    triggerType: TriggerType
  ): Cue!

  updateCue(
    id: ID!
    sceneId: ID
    timing: CueTimingInput
    name: String
    triggerType: TriggerType
  ): Cue!

  deleteCue(id: ID!): Boolean!

  reorderCues(cueListId: ID!, cueIds: [ID!]!): CueList!

  # Preview system
  startPreviewSession(projectId: ID!, baseSceneId: ID): PreviewSession!

  updatePreviewValues(sessionId: ID!, values: [ChannelValueInput!]!): Boolean!

  commitPreviewToScene(
    sessionId: ID!
    sceneId: ID!
    channelSelection: [ChannelSelection!]
  ): Scene!

  endPreviewSession(sessionId: ID!): Boolean!

  # DMX control
  activateCueList(id: ID!): Boolean!
  deactivateCueList(id: ID!): Boolean!
  triggerNextCue(cueListId: ID!): Cue!
  triggerSpecificCue(cueListId: ID!, cueId: ID!): Cue!
  pauseCueList(id: ID!): Boolean!
  resumeCueList(id: ID!): Boolean!
}

type Subscription {
  # DMX output monitoring
  dmxValuesChanged(
    projectId: ID!
    universe: Int
    channelRange: DMXRange
  ): [DMXChannelValue!]!

  # Preview updates
  previewValuesChanged(projectId: ID!): [ChannelPreviewValue!]!

  # Cue tracking
  cueTriggered(projectId: ID!, cueListId: ID): Cue!

  cueListStatusChanged(projectId: ID!, cueListId: ID): CueList!

  # User activity
  userActivity(projectId: ID!): UserAction!

  # Live updates
  fixtureAdded(projectId: ID!): Fixture!

  fixtureUpdated(projectId: ID!): Fixture!

  fixtureRemoved(projectId: ID!): ID!

  sceneUpdated(projectId: ID!): Scene!
}

type AuthPayload {
  token: String!
  refreshToken: String!
  user: User!
  expiresAt: DateTime!
}

input ProjectSettingsInput {
  defaultTimings: CueTimingInput
  defaultUniverseCount: Int
}
```
