import { typeDefs } from "../schema";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { validateSchema } from "graphql";

describe("GraphQL Schema", () => {
  describe("typeDefs", () => {
    it("should be defined and be a GraphQL document", () => {
      expect(typeDefs).toBeDefined();
      expect(typeDefs.kind).toBe("Document");
      expect(typeDefs.definitions).toBeDefined();
      expect(Array.isArray(typeDefs.definitions)).toBe(true);
    });

    it("should contain all core types", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      // Core domain types
      expect(schemaString).toContain("type Project");
      expect(schemaString).toContain("type FixtureDefinition");
      expect(schemaString).toContain("type FixtureInstance");
      expect(schemaString).toContain("type FixtureMode");
      expect(schemaString).toContain("type ModeChannel");
      expect(schemaString).toContain("type ChannelDefinition");
      expect(schemaString).toContain("type Scene");
      expect(schemaString).toContain("type CueList");
      expect(schemaString).toContain("type Cue");
      expect(schemaString).toContain("type FixtureValue");
    });

    it("should contain all enums", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("enum FixtureType");
      expect(schemaString).toContain("enum ChannelType");
      expect(schemaString).toContain("LED_PAR");
      expect(schemaString).toContain("MOVING_HEAD");
      expect(schemaString).toContain("INTENSITY");
      expect(schemaString).toContain("RED");
    });

    it("should contain input types", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("input FixtureDefinitionFilter");
      expect(schemaString).toContain("input CreateProjectInput");
      expect(schemaString).toContain("input CreateProjectInput");
      expect(schemaString).toContain("input CreateSceneInput");
      expect(schemaString).toContain("input FixtureValueInput");
    });

    it("should contain Query type with all operations", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("type Query");
      // Check for some key queries
      expect(schemaString).toContain("projects: [Project!]!");
      expect(schemaString).toContain("project(id: ID!): Project");
      expect(schemaString).toContain("scenes: [Scene!]!");
      expect(schemaString).toContain("cueLists: [CueList!]!");
      expect(schemaString).toContain("dmxOutput(universe: Int!): [Int!]!");
    });

    it("should contain Mutation type with all operations", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("type Mutation");
      // Check for some key mutations
      expect(schemaString).toContain("createProject(input: CreateProjectInput!): Project!");
      expect(schemaString).toContain("createScene(input: CreateSceneInput!): Scene!");
      expect(schemaString).toContain("setChannelValue(universe: Int!, channel: Int!, value: Int!): Boolean!");
      expect(schemaString).toContain("playCue(cueId: ID!, fadeInTime: Float): Boolean!");
    });

    it("should contain Subscription type", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("type Subscription");
      expect(schemaString).toContain("dmxOutputChanged");
      expect(schemaString).toContain("cueListPlaybackUpdated");
      expect(schemaString).toContain("previewSessionUpdated");
    });

    it("should contain preview and QLC export types", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("type PreviewSession");
      expect(schemaString).toContain("type FixtureMappingSuggestion");
      expect(schemaString).toContain("type QLCExportResult");
      expect(schemaString).toContain("type QLCImportResult");
    });

    it("should contain playback and cue list types", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      expect(schemaString).toContain("type CueListPlaybackStatus");
      expect(schemaString).toContain("type UniverseOutput");
      expect(schemaString).toContain("isPlaying: Boolean!");
      expect(schemaString).toContain("currentCue: Cue");
      expect(schemaString).toContain("fadeProgress: Float");
    });
  });

  describe("Schema validation", () => {
    it("should create a valid executable schema", () => {
      // Create a minimal resolver set to test schema compilation
      const mockResolvers = {
        Query: {
          projects: () => [],
          project: () => null,
        },
        Mutation: {
          createProject: () => null,
        },
        Subscription: {
          dmxOutputChanged: {
            subscribe: () => ({}),
          },
        },
      };

      expect(() => {
        const schema = makeExecutableSchema({
          typeDefs,
          resolvers: mockResolvers,
        });

        // Validate the schema
        const errors = validateSchema(schema);
        if (errors.length > 0) {
          throw new Error(`Schema validation errors: ${errors.map(e => e.message).join(', ')}`);
        }
      }).not.toThrow();
    });

    it("should have consistent field types across related types", () => {
      const schemaString = typeDefs.loc?.source.body || "";

      // Check that ID fields are consistent
      expect(schemaString).toContain("id: ID!");
      // Check that relationship fields use proper types
      expect(schemaString).toContain("projectId: ID!");
      expect(schemaString).toContain("sceneId: ID!");
      expect(schemaString).toContain("cueListId: ID!");
    });
  });
});