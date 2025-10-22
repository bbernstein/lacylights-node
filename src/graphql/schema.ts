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
    projectOrder: Int

    # 2D Layout Position (normalized 0-1 coordinates)
    layoutX: Float
    layoutY: Float
    layoutRotation: Float

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
    sceneOrder: Int
  }

  type CueList {
    id: ID!
    name: String!
    description: String
    loop: Boolean!
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

  type CueListPlaybackStatus {
    cueListId: ID!
    currentCueIndex: Int
    isPlaying: Boolean!
    currentCue: Cue
    nextCue: Cue
    previousCue: Cue
    fadeProgress: Float
    lastUpdated: String!
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

  type Setting {
    id: ID!
    key: String!
    value: String!
    createdAt: String!
    updatedAt: String!
  }

  type SystemInfo {
    artnetBroadcastAddress: String!
    artnetEnabled: Boolean!
  }

  type NetworkInterfaceOption {
    name: String!
    address: String!
    broadcast: String!
    description: String!
    interfaceType: String!
  }

  # Native LacyLights Export/Import
  type ExportResult {
    projectId: String!
    projectName: String!
    jsonContent: String!
    stats: ExportStats!
  }

  type ExportStats {
    fixtureDefinitionsCount: Int!
    fixtureInstancesCount: Int!
    scenesCount: Int!
    cueListsCount: Int!
    cuesCount: Int!
  }

  type ImportResult {
    projectId: String!
    stats: ImportStats!
    warnings: [String!]!
  }

  type ImportStats {
    fixtureDefinitionsCreated: Int!
    fixtureInstancesCreated: Int!
    scenesCreated: Int!
    cueListsCreated: Int!
    cuesCreated: Int!
  }

  # QLC+ Export
  type QLCExportResult {
    projectName: String!
    xmlContent: String!
    fixtureCount: Int!
    sceneCount: Int!
    cueListCount: Int!
  }

  type QLCImportResult {
    project: Project!
    originalFileName: String!
    fixtureCount: Int!
    sceneCount: Int!
    cueListCount: Int!
    warnings: [String!]!
  }

  type QLCFixtureDefinition {
    manufacturer: String!
    model: String!
    type: String!
    modes: [QLCFixtureMode!]!
  }

  type QLCFixtureMode {
    name: String!
    channelCount: Int!
  }

  type FixtureMapping {
    lacyLightsKey: String!
    qlcManufacturer: String!
    qlcModel: String!
    qlcMode: String!
  }

  type FixtureMappingSuggestion {
    fixture: LacyLightsFixture!
    suggestions: [QLCFixtureDefinition!]!
  }

  type LacyLightsFixture {
    manufacturer: String!
    model: String!
  }

  type QLCFixtureMappingResult {
    projectId: String!
    lacyLightsFixtures: [LacyLightsFixture!]!
    suggestions: [FixtureMappingSuggestion!]!
    defaultMappings: [FixtureMapping!]!
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
    projectOrder: Int
    layoutX: Float
    layoutY: Float
    layoutRotation: Float
  }

  input FixturePositionInput {
    fixtureId: ID!
    layoutX: Float!
    layoutY: Float!
    layoutRotation: Float
  }

  input FixtureOrderInput {
    fixtureId: ID!
    order: Int!
  }

  input CueOrderInput {
    cueId: ID!
    cueNumber: Float!
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
    sceneOrder: Int
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
    loop: Boolean
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

  input BulkCueUpdateInput {
    cueIds: [ID!]!
    fadeInTime: Float
    fadeOutTime: Float
    followTime: Float
    easingType: EasingType
  }

  input FixtureUpdateItem {
    fixtureId: ID!
    name: String
    description: String
    universe: Int
    startChannel: Int
    tags: [String!]
    layoutX: Float
    layoutY: Float
    layoutRotation: Float
  }

  input BulkFixtureUpdateInput {
    fixtures: [FixtureUpdateItem!]!
  }

  input BulkFixtureCreateInput {
    fixtures: [CreateFixtureInstanceInput!]!
  }

  input FixtureMappingInput {
    lacyLightsKey: String!
    qlcManufacturer: String!
    qlcModel: String!
    qlcMode: String!
  }

  enum ImportMode {
    CREATE
    MERGE
  }

  enum FixtureConflictStrategy {
    SKIP
    REPLACE
    ERROR
  }

  input ExportOptionsInput {
    description: String
    includeFixtures: Boolean
    includeScenes: Boolean
    includeCueLists: Boolean
  }

  input ImportOptionsInput {
    mode: ImportMode!
    targetProjectId: ID
    projectName: String
    fixtureConflictStrategy: FixtureConflictStrategy
    importBuiltInFixtures: Boolean
  }

  input UpdateSettingInput {
    key: String!
    value: String!
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
    cueListPlaybackStatus(cueListId: ID!): CueListPlaybackStatus

    # Cues
    cue(id: ID!): Cue

    # DMX Output
    dmxOutput(universe: Int!): [Int!]!
    allDmxOutput: [UniverseOutput!]!

    # Preview System
    previewSession(sessionId: ID!): PreviewSession

    # Active Scene Tracking
    currentActiveScene: Scene

    # Settings
    settings: [Setting!]!
    setting(key: String!): Setting

    # System Information
    systemInfo: SystemInfo!
    networkInterfaceOptions: [NetworkInterfaceOption!]!

    # QLC+ Fixture Mapping Suggestions (read-only)
    getQLCFixtureMappingSuggestions(projectId: ID!): QLCFixtureMappingResult!
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
    bulkUpdateFixtures(input: BulkFixtureUpdateInput!): [FixtureInstance!]!
    bulkCreateFixtures(input: BulkFixtureCreateInput!): [FixtureInstance!]!
    deleteFixtureInstance(id: ID!): Boolean!

    # Fixture Ordering
    reorderProjectFixtures(
      projectId: ID!
      fixtureOrders: [FixtureOrderInput!]!
    ): Boolean!
    reorderSceneFixtures(
      sceneId: ID!
      fixtureOrders: [FixtureOrderInput!]!
    ): Boolean!

    # Fixture Layout Positions
    updateFixturePositions(positions: [FixturePositionInput!]!): Boolean!

    # Scenes
    createScene(input: CreateSceneInput!): Scene!
    updateScene(id: ID!, input: UpdateSceneInput!): Scene!
    duplicateScene(id: ID!): Scene!
    deleteScene(id: ID!): Boolean!

    # Safe Scene Updates (Additive)
    addFixturesToScene(
      sceneId: ID!
      fixtureValues: [FixtureValueInput!]!
      overwriteExisting: Boolean = false
    ): Scene!
    removeFixturesFromScene(sceneId: ID!, fixtureIds: [ID!]!): Scene!
    updateScenePartial(
      sceneId: ID!
      name: String
      description: String
      fixtureValues: [FixtureValueInput!]
      mergeFixtures: Boolean = true
    ): Scene!

    # Cue Lists
    createCueList(input: CreateCueListInput!): CueList!
    updateCueList(id: ID!, input: CreateCueListInput!): CueList!
    deleteCueList(id: ID!): Boolean!

    # Cues
    createCue(input: CreateCueInput!): Cue!
    updateCue(id: ID!, input: CreateCueInput!): Cue!
    deleteCue(id: ID!): Boolean!
    reorderCues(cueListId: ID!, cueOrders: [CueOrderInput!]!): Boolean!
    bulkUpdateCues(input: BulkCueUpdateInput!): [Cue!]!

    # Preview System
    startPreviewSession(projectId: ID!): PreviewSession!
    commitPreviewSession(sessionId: ID!): Boolean!
    cancelPreviewSession(sessionId: ID!): Boolean!
    updatePreviewChannel(
      sessionId: ID!
      fixtureId: ID!
      channelIndex: Int!
      value: Int!
    ): Boolean!
    initializePreviewWithScene(sessionId: ID!, sceneId: ID!): Boolean!

    # DMX Control
    setChannelValue(universe: Int!, channel: Int!, value: Int!): Boolean!
    setSceneLive(sceneId: ID!): Boolean!
    playCue(cueId: ID!, fadeInTime: Float): Boolean!
    fadeToBlack(fadeOutTime: Float!): Boolean!

    # Cue List Playback Control
    startCueList(cueListId: ID!, startFromCue: Int): Boolean!
    nextCue(cueListId: ID!, fadeInTime: Float): Boolean!
    previousCue(cueListId: ID!, fadeInTime: Float): Boolean!
    goToCue(cueListId: ID!, cueIndex: Int!, fadeInTime: Float): Boolean!
    stopCueList(cueListId: ID!): Boolean!

    # Native LacyLights Import/Export
    exportProject(projectId: ID!, options: ExportOptionsInput): ExportResult!
    importProject(jsonContent: String!, options: ImportOptionsInput!): ImportResult!

    # QLC+ Import/Export (data-modifying operations)
    importProjectFromQLC(
      xmlContent: String!
      originalFileName: String!
    ): QLCImportResult!
    exportProjectToQLC(
      projectId: ID!
      fixtureMappings: [FixtureMappingInput!]
    ): QLCExportResult!

    # Settings
    updateSetting(input: UpdateSettingInput!): Setting!
  }

  # Subscriptions
  type Subscription {
    dmxOutputChanged(universe: Int): UniverseOutput!
    projectUpdated(projectId: ID!): Project!
    previewSessionUpdated(projectId: ID!): PreviewSession!
    cueListPlaybackUpdated(cueListId: ID!): CueListPlaybackStatus!
    systemInfoUpdated: SystemInfo!
  }
`;
