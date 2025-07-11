import { gql } from "graphql-tag";

export const typeDefs = gql`
  # Core Types
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

  type FixtureMode {
    id: ID!
    name: String!
    shortName: String
    channelCount: Int!
    channels: [ModeChannel!]!
  }

  type ModeChannel {
    id: ID!
    offset: Int!
    channel: ChannelDefinition!
  }

  type ChannelDefinition {
    id: ID!
    name: String!
    type: ChannelType!
    offset: Int!
    minValue: Int!
    maxValue: Int!
    defaultValue: Int!
  }

  type FixtureInstance {
    id: ID!
    name: String!
    description: String
    
    # Fixture Definition Info (flattened)
    definitionId: ID!
    manufacturer: String!
    model: String!
    type: FixtureType!
    
    # Mode Info (flattened)
    modeName: String!
    channelCount: Int!
    channels: [InstanceChannel!]!
    
    # DMX Configuration
    project: Project!
    universe: Int!
    startChannel: Int!
    tags: [String!]!
    createdAt: String!
    
  }

  type InstanceChannel {
    id: ID!
    offset: Int!
    name: String!
    type: ChannelType!
    minValue: Int!
    maxValue: Int!
    defaultValue: Int!
  }

  type Scene {
    id: ID!
    name: String!
    description: String
    project: Project!
    fixtureValues: [FixtureValue!]!
    createdAt: String!
    updatedAt: String!
  }
  type FixtureValue {
    id: ID!
    fixture: FixtureInstance!
    channelValues: [Int!]!
  }

  type CueList {
    id: ID!
    name: String!
    description: String
    project: Project!
    cues: [Cue!]!
    createdAt: String!
    updatedAt: String!
  }

  type Cue {
    id: ID!
    name: String!
    cueNumber: Float!
    scene: Scene!
    cueList: CueList!
    fadeInTime: Float!
    fadeOutTime: Float!
    followTime: Float
    easingType: EasingType
    notes: String
  }

  type User {
    id: ID!
    email: String!
    name: String
    role: UserRole!
    createdAt: String!
  }

  type ProjectUser {
    id: ID!
    user: User!
    project: Project!
    role: ProjectRole!
    joinedAt: String!
  }

  type PreviewSession {
    id: ID!
    project: Project!
    user: User!
    isActive: Boolean!
    createdAt: String!
    dmxOutput: [UniverseOutput!]!
  }

  type UniverseOutput {
    universe: Int!
    channels: [Int!]!
  }
  # Enums
  enum FixtureType {
    LED_PAR
    MOVING_HEAD
    STROBE
    DIMMER
    OTHER
  }

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

  enum UserRole {
    ADMIN
    USER
  }

  enum ProjectRole {
    OWNER
    EDITOR
    VIEWER
  }

  enum EasingType {
    LINEAR
    EASE_IN_OUT_CUBIC
    EASE_IN_OUT_SINE
    EASE_OUT_EXPONENTIAL
    BEZIER
    S_CURVE
  }

  # Input Types
  input CreateProjectInput {
    name: String!
    description: String
  }

  input CreateFixtureDefinitionInput {
    manufacturer: String!
    model: String!
    type: FixtureType!
    channels: [CreateChannelDefinitionInput!]!
  }

  input CreateChannelDefinitionInput {
    name: String!
    type: ChannelType!
    offset: Int!
    minValue: Int!
    maxValue: Int!
    defaultValue: Int!
  }
  input CreateFixtureInstanceInput {
    name: String!
    description: String
    definitionId: ID!
    modeId: ID
    projectId: ID!
    universe: Int!
    startChannel: Int!
    tags: [String!]
  }

  input UpdateFixtureInstanceInput {
    name: String
    description: String
    definitionId: ID
    modeId: ID
    universe: Int
    startChannel: Int
    tags: [String!]
  }

  input CreateSceneInput {
    name: String!
    description: String
    projectId: ID!
    fixtureValues: [FixtureValueInput!]!
  }

  input UpdateSceneInput {
    name: String
    description: String
    fixtureValues: [FixtureValueInput!]
  }

  input FixtureValueInput {
    fixtureId: ID!
    channelValues: [Int!]!
  }

  input FixtureDefinitionFilter {
    manufacturer: String
    model: String
    type: FixtureType
    isBuiltIn: Boolean
    channelTypes: [ChannelType!]
  }

  input CreateCueListInput {
    name: String!
    description: String
    projectId: ID!
  }

  input CreateCueInput {
    name: String!
    cueNumber: Float!
    cueListId: ID!
    sceneId: ID!
    fadeInTime: Float!
    fadeOutTime: Float!
    followTime: Float
    easingType: EasingType
    notes: String
  }

  # Queries
  type Query {
    # Projects
    projects: [Project!]!
    project(id: ID!): Project

    # Fixtures
    fixtureDefinitions(filter: FixtureDefinitionFilter): [FixtureDefinition!]!
    fixtureDefinition(id: ID!): FixtureDefinition

    # Scenes
    scene(id: ID!): Scene

    # Cue Lists
    cueList(id: ID!): CueList
    
    # Cues
    cue(id: ID!): Cue

    # DMX Output
    dmxOutput(universe: Int!): [Int!]!
    allDmxOutput: [UniverseOutput!]!

    # Preview System
    previewSession(sessionId: ID!): PreviewSession
  }
  # Mutations
  type Mutation {
    # Project Management
    createProject(input: CreateProjectInput!): Project!
    updateProject(id: ID!, input: CreateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!

    # Fixture Definitions
    createFixtureDefinition(
      input: CreateFixtureDefinitionInput!
    ): FixtureDefinition!
    updateFixtureDefinition(
      id: ID!
      input: CreateFixtureDefinitionInput!
    ): FixtureDefinition!
    deleteFixtureDefinition(id: ID!): Boolean!

    # Fixture Instances
    createFixtureInstance(input: CreateFixtureInstanceInput!): FixtureInstance!
    updateFixtureInstance(
      id: ID!
      input: UpdateFixtureInstanceInput!
    ): FixtureInstance!
    deleteFixtureInstance(id: ID!): Boolean!

    # Scenes
    createScene(input: CreateSceneInput!): Scene!
    updateScene(id: ID!, input: UpdateSceneInput!): Scene!
    duplicateScene(id: ID!): Scene!
    deleteScene(id: ID!): Boolean!

    # Cue Lists
    createCueList(input: CreateCueListInput!): CueList!
    updateCueList(id: ID!, input: CreateCueListInput!): CueList!
    deleteCueList(id: ID!): Boolean!

    # Cues
    createCue(input: CreateCueInput!): Cue!
    updateCue(id: ID!, input: CreateCueInput!): Cue!
    deleteCue(id: ID!): Boolean!

    # Preview System
    startPreviewSession(projectId: ID!): PreviewSession!
    commitPreviewSession(sessionId: ID!): Boolean!
    cancelPreviewSession(sessionId: ID!): Boolean!
    updatePreviewChannel(sessionId: ID!, fixtureId: ID!, channelIndex: Int!, value: Int!): Boolean!
    initializePreviewWithScene(sessionId: ID!, sceneId: ID!): Boolean!

    # DMX Control
    setChannelValue(universe: Int!, channel: Int!, value: Int!): Boolean!
    setSceneLive(sceneId: ID!): Boolean!
    playCue(cueId: ID!, fadeInTime: Float): Boolean!
    fadeToBlack(fadeOutTime: Float!): Boolean!
  }

  # Subscriptions
  type Subscription {
    dmxOutputChanged(universe: Int): UniverseOutput!
    projectUpdated(projectId: ID!): Project!
    previewSessionUpdated(projectId: ID!): PreviewSession!
  }
`;