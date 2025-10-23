import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema";
import { resolvers } from "../resolvers";
import { PrismaClient } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { Context } from "../../context";
import { FixtureType } from "../../types/enums";
import { execSync } from "child_process";
import * as fs from "fs";

// Set DATABASE_URL for testing with SQLite
process.env.DATABASE_URL = "file:./test-integration.db";

// Types for GraphQL responses
interface SceneSummary {
  id: string;
  name: string;
  description: string | null;
  fixtureCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CueUsageSummary {
  cueId: string;
  cueNumber: number;
  cueName: string;
  cueListId: string;
  cueListName: string;
}

interface FixtureUsage {
  fixtureId: string;
  fixtureName: string;
  scenes: SceneSummary[];
  cues: CueUsageSummary[];
}

interface SceneUsage {
  sceneId: string;
  sceneName: string;
  cues: CueUsageSummary[];
}

interface SceneDifference {
  fixtureId: string;
  fixtureName: string;
  scene1Values: number[];
  scene2Values: number[];
  differenceType: "VALUES_CHANGED" | "ONLY_IN_SCENE1" | "ONLY_IN_SCENE2";
}

interface SceneComparison {
  scene1: SceneSummary;
  scene2: SceneSummary;
  differences: SceneDifference[];
  identicalFixtureCount: number;
  differentFixtureCount: number;
}

interface FixtureUsageQueryData {
  fixtureUsage?: FixtureUsage;
}

interface SceneUsageQueryData {
  sceneUsage?: SceneUsage;
}

interface SceneComparisonQueryData {
  compareScenes?: SceneComparison;
}

describe("Relationship GraphQL Resolvers", () => {
  let server: ApolloServer<Context>;
  let prisma: PrismaClient;
  let pubsub: PubSub;
  let testProjectId: string;
  let testDefinitionId: string;
  let testFixture1Id: string;
  let testFixture2Id: string;
  let testScene1Id: string;
  let testScene2Id: string;

  beforeAll(async () => {
    const testDbPath = "./test-integration.db";
    const testDbUrl = `file:${testDbPath}`;

    // Clean up existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-journal`)) {
      fs.unlinkSync(`${testDbPath}-journal`);
    }

    // Run migrations to set up the schema
    try {
      execSync("npx prisma migrate deploy", {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: testDbUrl },
      });
    } catch (error) {
      throw new Error(
        `Failed to run migrations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    prisma = new PrismaClient();
    pubsub = new PubSub();
    await prisma.$connect();

    server = new ApolloServer<Context>({
      typeDefs,
      resolvers,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data in correct order to avoid foreign key constraints
    await prisma.fixtureValue.deleteMany();
    await prisma.instanceChannel.deleteMany();
    await prisma.fixtureInstance.deleteMany();
    await prisma.scene.deleteMany();
    await prisma.cue.deleteMany();
    await prisma.cueList.deleteMany();
    await prisma.modeChannel.deleteMany();
    await prisma.fixtureMode.deleteMany();
    await prisma.channelDefinition.deleteMany();
    await prisma.fixtureDefinition.deleteMany();
    await prisma.projectUser.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    // Wait a bit to avoid race conditions
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: "Test Project",
        description: "Test project for relationship tests",
      },
    });
    testProjectId = project.id;

    // Create test fixture definition with mode
    const definition = await prisma.fixtureDefinition.create({
      data: {
        manufacturer: "TestCo",
        model: "TestPar",
        type: FixtureType.LED_PAR,
        isBuiltIn: false,
      },
    });
    testDefinitionId = definition.id;

    // Create channels
    const redChannel = await prisma.channelDefinition.create({
      data: {
        name: "Red",
        type: "RED",
        offset: 0,
        minValue: 0,
        maxValue: 255,
        defaultValue: 0,
        definitionId: definition.id,
      },
    });

    const greenChannel = await prisma.channelDefinition.create({
      data: {
        name: "Green",
        type: "GREEN",
        offset: 1,
        minValue: 0,
        maxValue: 255,
        defaultValue: 0,
        definitionId: definition.id,
      },
    });

    // Create mode
    const mode = await prisma.fixtureMode.create({
      data: {
        name: "2CH",
        shortName: "2CH",
        channelCount: 2,
        definitionId: definition.id,
      },
    });

    // Link channels to mode
    await prisma.modeChannel.createMany({
      data: [
        {
          modeId: mode.id,
          channelId: redChannel.id,
          offset: 0,
        },
        {
          modeId: mode.id,
          channelId: greenChannel.id,
          offset: 1,
        },
      ],
    });

    // Create two fixture instances
    const fixture1 = await prisma.fixtureInstance.create({
      data: {
        name: "Test Fixture 1",
        definitionId: definition.id,
        manufacturer: "TestCo",
        model: "TestPar",
        type: FixtureType.LED_PAR,
        modeName: "2CH",
        channelCount: 2,
        projectId: testProjectId,
        universe: 1,
        startChannel: 1,
        tags: "test",
      },
    });
    testFixture1Id = fixture1.id;

    const fixture2 = await prisma.fixtureInstance.create({
      data: {
        name: "Test Fixture 2",
        definitionId: definition.id,
        manufacturer: "TestCo",
        model: "TestPar",
        type: FixtureType.LED_PAR,
        modeName: "2CH",
        channelCount: 2,
        projectId: testProjectId,
        universe: 1,
        startChannel: 10,
        tags: "test",
      },
    });
    testFixture2Id = fixture2.id;

    // Create instance channels for both fixtures
    await prisma.instanceChannel.createMany({
      data: [
        {
          fixtureId: fixture1.id,
          offset: 0,
          name: "Red",
          type: "RED",
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          fixtureId: fixture1.id,
          offset: 1,
          name: "Green",
          type: "GREEN",
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          fixtureId: fixture2.id,
          offset: 0,
          name: "Red",
          type: "RED",
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          fixtureId: fixture2.id,
          offset: 1,
          name: "Green",
          type: "GREEN",
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
      ],
    });

    // Create two scenes
    const scene1 = await prisma.scene.create({
      data: {
        name: "Scene 1",
        description: "First test scene",
        projectId: testProjectId,
      },
    });
    testScene1Id = scene1.id;

    const scene2 = await prisma.scene.create({
      data: {
        name: "Scene 2",
        description: "Second test scene",
        projectId: testProjectId,
      },
    });
    testScene2Id = scene2.id;

    // Add fixture values to scenes
    await prisma.fixtureValue.createMany({
      data: [
        {
          sceneId: scene1.id,
          fixtureId: fixture1.id,
          channelValues: JSON.stringify([255, 0]), // Red
          sceneOrder: 0,
        },
        {
          sceneId: scene1.id,
          fixtureId: fixture2.id,
          channelValues: JSON.stringify([0, 255]), // Green
          sceneOrder: 1,
        },
        {
          sceneId: scene2.id,
          fixtureId: fixture1.id,
          channelValues: JSON.stringify([255, 0]), // Red (same as scene1)
          sceneOrder: 0,
        },
      ],
    });

    // Create cue list
    const cueList = await prisma.cueList.create({
      data: {
        name: "Test Cue List",
        description: "Test cue list",
        loop: false,
        projectId: testProjectId,
      },
    });

    // Create cues referencing scenes
    await prisma.cue.createMany({
      data: [
        {
          name: "Cue 1",
          cueNumber: 1.0,
          cueListId: cueList.id,
          sceneId: scene1.id,
          fadeInTime: 3.0,
          fadeOutTime: 3.0,
        },
        {
          name: "Cue 2",
          cueNumber: 2.0,
          cueListId: cueList.id,
          sceneId: scene2.id,
          fadeInTime: 2.0,
          fadeOutTime: 2.0,
        },
      ],
    });
  });

  describe("fixtureUsage", () => {
    it("should return fixture usage with scenes and cues", async () => {
      const query = `
        query FixtureUsage($fixtureId: ID!) {
          fixtureUsage(fixtureId: $fixtureId) {
            fixtureId
            fixtureName
            scenes {
              id
              name
              description
              fixtureCount
              createdAt
              updatedAt
            }
            cues {
              cueId
              cueNumber
              cueName
              cueListId
              cueListName
            }
          }
        }
      `;

      const result = await server.executeOperation<FixtureUsageQueryData>(
        {
          query,
          variables: { fixtureId: testFixture1Id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;
        expect(data?.fixtureUsage).toBeDefined();
        expect(data?.fixtureUsage?.fixtureId).toBe(testFixture1Id);
        expect(data?.fixtureUsage?.fixtureName).toBe("Test Fixture 1");
        expect(data?.fixtureUsage?.scenes).toHaveLength(2);
        expect(data?.fixtureUsage?.cues).toHaveLength(2);
        expect(data?.fixtureUsage?.cues?.[0]?.cueName).toBe("Cue 1");
      }
    });

    it("should return empty arrays for unused fixture", async () => {
      // Create a fixture not used in any scenes
      const unusedFixture = await prisma.fixtureInstance.create({
        data: {
          name: "Unused Fixture",
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "2CH",
          channelCount: 2,
          projectId: testProjectId,
          universe: 1,
          startChannel: 20,
          tags: null,
        },
      });

      const query = `
        query FixtureUsage($fixtureId: ID!) {
          fixtureUsage(fixtureId: $fixtureId) {
            fixtureId
            fixtureName
            scenes {
              id
            }
            cues {
              cueId
            }
          }
        }
      `;

      const result = await server.executeOperation<FixtureUsageQueryData>(
        {
          query,
          variables: { fixtureId: unusedFixture.id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;
        expect(data?.fixtureUsage?.scenes).toHaveLength(0);
        expect(data?.fixtureUsage?.cues).toHaveLength(0);
      }
    });

    it("should error for non-existent fixture", async () => {
      const query = `
        query FixtureUsage($fixtureId: ID!) {
          fixtureUsage(fixtureId: $fixtureId) {
            fixtureId
          }
        }
      `;

      const result = await server.executeOperation<FixtureUsageQueryData>(
        {
          query,
          variables: { fixtureId: "non-existent-id" },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0]?.message).toContain(
          "not found",
        );
      }
    });
  });

  describe("sceneUsage", () => {
    it("should return scene usage with cues", async () => {
      const query = `
        query SceneUsage($sceneId: ID!) {
          sceneUsage(sceneId: $sceneId) {
            sceneId
            sceneName
            cues {
              cueId
              cueNumber
              cueName
              cueListId
              cueListName
            }
          }
        }
      `;

      const result = await server.executeOperation<SceneUsageQueryData>(
        {
          query,
          variables: { sceneId: testScene1Id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;
        expect(data?.sceneUsage).toBeDefined();
        expect(data?.sceneUsage?.sceneId).toBe(testScene1Id);
        expect(data?.sceneUsage?.sceneName).toBe("Scene 1");
        expect(data?.sceneUsage?.cues).toHaveLength(1);
        expect(data?.sceneUsage?.cues?.[0]?.cueName).toBe("Cue 1");
      }
    });

    it("should return empty array for scene with no cues", async () => {
      // Create a scene not used in any cues
      const unusedScene = await prisma.scene.create({
        data: {
          name: "Unused Scene",
          projectId: testProjectId,
        },
      });

      const query = `
        query SceneUsage($sceneId: ID!) {
          sceneUsage(sceneId: $sceneId) {
            sceneId
            sceneName
            cues {
              cueId
            }
          }
        }
      `;

      const result = await server.executeOperation<SceneUsageQueryData>(
        {
          query,
          variables: { sceneId: unusedScene.id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;
        expect(data?.sceneUsage?.cues).toHaveLength(0);
      }
    });

    it("should error for non-existent scene", async () => {
      const query = `
        query SceneUsage($sceneId: ID!) {
          sceneUsage(sceneId: $sceneId) {
            sceneId
          }
        }
      `;

      const result = await server.executeOperation<SceneUsageQueryData>(
        {
          query,
          variables: { sceneId: "non-existent-id" },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0]?.message).toContain(
          "not found",
        );
      }
    });
  });

  describe("compareScenes", () => {
    it("should identify identical and different fixtures", async () => {
      const query = `
        query CompareScenes($sceneId1: ID!, $sceneId2: ID!) {
          compareScenes(sceneId1: $sceneId1, sceneId2: $sceneId2) {
            scene1 {
              id
              name
              fixtureCount
            }
            scene2 {
              id
              name
              fixtureCount
            }
            differences {
              fixtureId
              fixtureName
              scene1Values
              scene2Values
              differenceType
            }
            identicalFixtureCount
            differentFixtureCount
          }
        }
      `;

      const result = await server.executeOperation<SceneComparisonQueryData>(
        {
          query,
          variables: { sceneId1: testScene1Id, sceneId2: testScene2Id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;
        expect(data?.compareScenes).toBeDefined();
        expect(data?.compareScenes?.scene1.id).toBe(testScene1Id);
        expect(data?.compareScenes?.scene2.id).toBe(testScene2Id);

        // Scene1 has fixture1 (red) and fixture2 (green)
        // Scene2 has fixture1 (red - identical)
        expect(data?.compareScenes?.identicalFixtureCount).toBe(1);
        expect(data?.compareScenes?.differentFixtureCount).toBe(1);
        expect(data?.compareScenes?.differences).toHaveLength(1);

        // Should show fixture2 only in scene1
        const diff = data?.compareScenes?.differences?.[0];
        expect(diff?.fixtureId).toBe(testFixture2Id);
        expect(diff?.differenceType).toBe("ONLY_IN_SCENE1");
        expect(diff?.scene1Values).toEqual([0, 255]);
        expect(diff?.scene2Values).toEqual([]);
      }
    });

    it("should identify value changes", async () => {
      // Create a third scene with same fixtures but different values
      const scene3 = await prisma.scene.create({
        data: {
          name: "Scene 3",
          projectId: testProjectId,
        },
      });

      await prisma.fixtureValue.createMany({
        data: [
          {
            sceneId: scene3.id,
            fixtureId: testFixture1Id,
            channelValues: JSON.stringify([128, 128]), // Different values
            sceneOrder: 0,
          },
          {
            sceneId: scene3.id,
            fixtureId: testFixture2Id,
            channelValues: JSON.stringify([0, 255]), // Same as scene1
            sceneOrder: 1,
          },
        ],
      });

      const query = `
        query CompareScenes($sceneId1: ID!, $sceneId2: ID!) {
          compareScenes(sceneId1: $sceneId1, sceneId2: $sceneId2) {
            differences {
              fixtureId
              fixtureName
              scene1Values
              scene2Values
              differenceType
            }
            identicalFixtureCount
            differentFixtureCount
          }
        }
      `;

      const result = await server.executeOperation<SceneComparisonQueryData>(
        {
          query,
          variables: { sceneId1: testScene1Id, sceneId2: scene3.id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        // Both scenes have both fixtures, but fixture1 has different values
        expect(data?.compareScenes?.identicalFixtureCount).toBe(1); // fixture2
        expect(data?.compareScenes?.differentFixtureCount).toBe(1); // fixture1
        expect(data?.compareScenes?.differences).toHaveLength(1);

        const diff = data?.compareScenes?.differences?.[0];
        expect(diff?.fixtureId).toBe(testFixture1Id);
        expect(diff?.differenceType).toBe("VALUES_CHANGED");
        expect(diff?.scene1Values).toEqual([255, 0]);
        expect(diff?.scene2Values).toEqual([128, 128]);
      }
    });

    it("should handle completely different scenes", async () => {
      // Create two new scenes with no overlap
      const scene4 = await prisma.scene.create({
        data: {
          name: "Scene 4",
          projectId: testProjectId,
        },
      });

      const scene5 = await prisma.scene.create({
        data: {
          name: "Scene 5",
          projectId: testProjectId,
        },
      });

      await prisma.fixtureValue.create({
        data: {
          sceneId: scene4.id,
          fixtureId: testFixture1Id,
          channelValues: JSON.stringify([255, 0]),
          sceneOrder: 0,
        },
      });

      await prisma.fixtureValue.create({
        data: {
          sceneId: scene5.id,
          fixtureId: testFixture2Id,
          channelValues: JSON.stringify([0, 255]),
          sceneOrder: 0,
        },
      });

      const query = `
        query CompareScenes($sceneId1: ID!, $sceneId2: ID!) {
          compareScenes(sceneId1: $sceneId1, sceneId2: $sceneId2) {
            differences {
              fixtureId
              differenceType
            }
            identicalFixtureCount
            differentFixtureCount
          }
        }
      `;

      const result = await server.executeOperation<SceneComparisonQueryData>(
        {
          query,
          variables: { sceneId1: scene4.id, sceneId2: scene5.id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeUndefined();
        const data = result.body.singleResult.data;

        expect(data?.compareScenes?.identicalFixtureCount).toBe(0);
        expect(data?.compareScenes?.differentFixtureCount).toBe(2);
        expect(data?.compareScenes?.differences).toHaveLength(2);

        // Check that we have one ONLY_IN_SCENE1 and one ONLY_IN_SCENE2
        const types = data?.compareScenes?.differences?.map(
          (d) => d.differenceType,
        );
        expect(types).toContain("ONLY_IN_SCENE1");
        expect(types).toContain("ONLY_IN_SCENE2");
      }
    });

    it("should error for non-existent scenes", async () => {
      const query = `
        query CompareScenes($sceneId1: ID!, $sceneId2: ID!) {
          compareScenes(sceneId1: $sceneId1, sceneId2: $sceneId2) {
            scene1 { id }
          }
        }
      `;

      const result = await server.executeOperation<SceneComparisonQueryData>(
        {
          query,
          variables: { sceneId1: "invalid-id", sceneId2: testScene2Id },
        },
        {
          contextValue: { prisma, pubsub },
        },
      );

      expect(result.body.kind).toBe("single");
      if (result.body.kind === "single") {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0]?.message).toContain(
          "not found",
        );
      }
    });
  });
});
