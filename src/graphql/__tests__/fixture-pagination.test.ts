import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema";
import { resolvers } from "../resolvers";
import { PrismaClient } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { Context } from "../../context";
import { FixtureType } from "../../types/enums";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Set DATABASE_URL for testing with SQLite
const testDbPath = path.join(__dirname, "../../../test-fixture-pagination.db");
const testDbUrl = `file:${testDbPath}`;
process.env.DATABASE_URL = testDbUrl;

// Types for GraphQL responses
interface FixtureInstance {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  type: string;
  universe: number;
  startChannel: number;
  tags: string[];
}

interface PaginationInfo {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasMore: boolean;
}

interface FixtureInstancePage {
  fixtures: FixtureInstance[];
  pagination: PaginationInfo;
}

interface FixtureInstancesQueryData {
  fixtureInstances?: FixtureInstancePage;
}

interface FixtureInstanceQueryData {
  fixtureInstance?: FixtureInstance | null;
}

describe("Fixture Pagination GraphQL Resolvers", () => {
  let server: ApolloServer<Context>;
  let prisma: PrismaClient;
  let pubsub: PubSub;
  let testProjectId: string;
  let testDefinitionId: string;

  beforeAll(async () => {
    // Only run migrations if database doesn't exist
    const needsMigration = !fs.existsSync(testDbPath);

    if (needsMigration) {
      // Remove any leftover journal files
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
          `Migration failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });
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
        description: "Test project for fixture tests",
      },
    });
    testProjectId = project.id;

    // Create test fixture definition
    const definition = await prisma.fixtureDefinition.create({
      data: {
        manufacturer: "TestCo",
        model: "TestPar",
        type: FixtureType.LED_PAR,
        isBuiltIn: false,
        channels: {
          create: [
            {
              name: "Intensity",
              type: "INTENSITY",
              offset: 0,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
            {
              name: "Red",
              type: "RED",
              offset: 1,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
          ],
        },
      },
    });
    testDefinitionId = definition.id;
  });

  const createTestContext = (): Context => ({
    prisma,
    pubsub,
    req: {} as any,
    res: {} as any,
  });

  describe("Query.fixtureInstances", () => {
    it("should return empty page when no fixtures exist", async () => {
      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!) {
              fixtureInstances(projectId: $projectId) {
                fixtures {
                  id
                  name
                }
                pagination {
                  total
                  page
                  perPage
                  totalPages
                  hasMore
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toEqual([]);
        expect(data?.pagination).toEqual({
          total: 0,
          page: 1,
          perPage: 50,
          totalPages: 0,
          hasMore: false,
        });
      }
    });

    it("should return fixtures with default pagination", async () => {
      // Create test fixtures
      await prisma.fixtureInstance.create({
        data: {
          name: "Fixture 1",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          channels: {
            create: [
              {
                name: "Intensity",
                type: "INTENSITY",
                offset: 0,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            ],
          },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "Fixture 2",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 10,
          channels: {
            create: [
              {
                name: "Intensity",
                type: "INTENSITY",
                offset: 0,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            ],
          },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!) {
              fixtureInstances(projectId: $projectId) {
                fixtures {
                  id
                  name
                  manufacturer
                  model
                  type
                  universe
                  startChannel
                }
                pagination {
                  total
                  page
                  perPage
                  totalPages
                  hasMore
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(2);
        expect(data?.fixtures[0].name).toBe("Fixture 1");
        expect(data?.fixtures[1].name).toBe("Fixture 2");
        expect(data?.pagination).toEqual({
          total: 2,
          page: 1,
          perPage: 50,
          totalPages: 1,
          hasMore: false,
        });
      }
    });

    it("should respect custom page and perPage parameters", async () => {
      // Create 5 fixtures
      for (let i = 1; i <= 5; i++) {
        await prisma.fixtureInstance.create({
          data: {
            name: `Fixture ${i}`,
            projectId: testProjectId,
            definitionId: testDefinitionId,
            manufacturer: "TestCo",
            model: "TestPar",
            type: FixtureType.LED_PAR,
            modeName: "Default",
            channelCount: 2,
            universe: 1,
            startChannel: i * 10,
            channels: {
              create: [
                {
                  name: "Intensity",
                  type: "INTENSITY",
                  offset: 0,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                },
              ],
            },
          },
        });
      }

      // Get page 2 with 2 items per page
      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $page: Int, $perPage: Int) {
              fixtureInstances(projectId: $projectId, page: $page, perPage: $perPage) {
                fixtures {
                  id
                  name
                }
                pagination {
                  total
                  page
                  perPage
                  totalPages
                  hasMore
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            page: 2,
            perPage: 2,
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(2);
        expect(data?.fixtures[0].name).toBe("Fixture 3");
        expect(data?.fixtures[1].name).toBe("Fixture 4");
        expect(data?.pagination).toEqual({
          total: 5,
          page: 2,
          perPage: 2,
          totalPages: 3,
          hasMore: true,
        });
      }
    });

    it("should enforce maximum perPage of 100", async () => {
      // Create 1 fixture
      await prisma.fixtureInstance.create({
        data: {
          name: "Fixture 1",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          channels: {
            create: [
              {
                name: "Intensity",
                type: "INTENSITY",
                offset: 0,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            ],
          },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $perPage: Int) {
              fixtureInstances(projectId: $projectId, perPage: $perPage) {
                fixtures {
                  id
                  name
                }
                pagination {
                  total
                  page
                  perPage
                  totalPages
                  hasMore
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            perPage: 200, // Request more than max
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.pagination.perPage).toBe(100); // Should be capped at 100
      }
    });

    it("should filter by fixture type", async () => {
      // Create fixtures of different types
      await prisma.fixtureInstance.create({
        data: {
          name: "LED PAR",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          channels: { create: [] },
        },
      });

      // Create moving head definition and fixture
      const movingHeadDef = await prisma.fixtureDefinition.create({
        data: {
          manufacturer: "TestCo",
          model: "TestMovingHead",
          type: FixtureType.MOVING_HEAD,
          isBuiltIn: false,
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "Moving Head",
          projectId: testProjectId,
          definitionId: movingHeadDef.id,
          manufacturer: "TestCo",
          model: "TestMovingHead",
          type: FixtureType.MOVING_HEAD,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 10,
          channels: { create: [] },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $filter: FixtureFilterInput) {
              fixtureInstances(projectId: $projectId, filter: $filter) {
                fixtures {
                  id
                  name
                  type
                }
                pagination {
                  total
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            filter: {
              type: "LED_PAR",
            },
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(1);
        expect(data?.fixtures[0].type).toBe("LED_PAR");
        expect(data?.pagination.total).toBe(1);
      }
    });

    it("should filter by universe", async () => {
      // Create fixtures in different universes
      await prisma.fixtureInstance.create({
        data: {
          name: "Universe 1",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "Universe 2",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 2,
          startChannel: 1,
          channels: { create: [] },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $filter: FixtureFilterInput) {
              fixtureInstances(projectId: $projectId, filter: $filter) {
                fixtures {
                  id
                  name
                  universe
                }
                pagination {
                  total
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            filter: {
              universe: 2,
            },
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(1);
        expect(data?.fixtures[0].universe).toBe(2);
        expect(data?.pagination.total).toBe(1);
      }
    });

    it("should filter by manufacturer", async () => {
      // Create another definition with different manufacturer
      const otherDef = await prisma.fixtureDefinition.create({
        data: {
          manufacturer: "OtherCo",
          model: "OtherModel",
          type: FixtureType.LED_PAR,
          isBuiltIn: false,
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "TestCo Fixture",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "OtherCo Fixture",
          projectId: testProjectId,
          definitionId: otherDef.id,
          manufacturer: "OtherCo",
          model: "OtherModel",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 10,
          channels: { create: [] },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $filter: FixtureFilterInput) {
              fixtureInstances(projectId: $projectId, filter: $filter) {
                fixtures {
                  id
                  name
                  manufacturer
                }
                pagination {
                  total
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            filter: {
              manufacturer: "Test",
            },
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(1);
        expect(data?.fixtures[0].manufacturer).toBe("TestCo");
        expect(data?.pagination.total).toBe(1);
      }
    });

    it("should filter by tags", async () => {
      await prisma.fixtureInstance.create({
        data: {
          name: "Front Light",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          tags: "front,wash",
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "Back Light",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 10,
          tags: "back,spot",
          channels: { create: [] },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $filter: FixtureFilterInput) {
              fixtureInstances(projectId: $projectId, filter: $filter) {
                fixtures {
                  id
                  name
                  tags
                }
                pagination {
                  total
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            filter: {
              tags: ["front"],
            },
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(1);
        expect(data?.fixtures[0].name).toBe("Front Light");
        expect(data?.pagination.total).toBe(1);
      }
    });

    it("should combine multiple filters", async () => {
      await prisma.fixtureInstance.create({
        data: {
          name: "Match All",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          tags: "front,wash",
          channels: { create: [] },
        },
      });

      await prisma.fixtureInstance.create({
        data: {
          name: "Wrong Universe",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 2,
          startChannel: 1,
          tags: "front,wash",
          channels: { create: [] },
        },
      });

      const response = await server.executeOperation<FixtureInstancesQueryData>(
        {
          query: `
            query($projectId: ID!, $filter: FixtureFilterInput) {
              fixtureInstances(projectId: $projectId, filter: $filter) {
                fixtures {
                  id
                  name
                }
                pagination {
                  total
                }
              }
            }
          `,
          variables: {
            projectId: testProjectId,
            filter: {
              type: "LED_PAR",
              universe: 1,
              tags: ["front"],
            },
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstances;
        expect(data?.fixtures).toHaveLength(1);
        expect(data?.fixtures[0].name).toBe("Match All");
        expect(data?.pagination.total).toBe(1);
      }
    });
  });

  describe("Query.fixtureInstance", () => {
    it("should return null when fixture does not exist", async () => {
      const response = await server.executeOperation<FixtureInstanceQueryData>(
        {
          query: `
            query($id: ID!) {
              fixtureInstance(id: $id) {
                id
                name
              }
            }
          `,
          variables: {
            id: "nonexistent-id",
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.fixtureInstance).toBeNull();
      }
    });

    it("should return fixture instance when it exists", async () => {
      const fixture = await prisma.fixtureInstance.create({
        data: {
          name: "Test Fixture",
          projectId: testProjectId,
          definitionId: testDefinitionId,
          manufacturer: "TestCo",
          model: "TestPar",
          type: FixtureType.LED_PAR,
          modeName: "Default",
          channelCount: 2,
          universe: 1,
          startChannel: 1,
          tags: "front,wash",
          channels: {
            create: [
              {
                name: "Intensity",
                type: "INTENSITY",
                offset: 0,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
              {
                name: "Red",
                type: "RED",
                offset: 1,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            ],
          },
        },
      });

      const response = await server.executeOperation<FixtureInstanceQueryData>(
        {
          query: `
            query($id: ID!) {
              fixtureInstance(id: $id) {
                id
                name
                manufacturer
                model
                type
                universe
                startChannel
                tags
              }
            }
          `,
          variables: {
            id: fixture.id,
          },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        const data = response.body.singleResult.data?.fixtureInstance;
        expect(data).not.toBeNull();
        expect(data?.name).toBe("Test Fixture");
        expect(data?.manufacturer).toBe("TestCo");
        expect(data?.model).toBe("TestPar");
        expect(data?.type).toBe("LED_PAR");
        expect(data?.universe).toBe(1);
        expect(data?.startChannel).toBe(1);
        // Tags come through the GraphQL resolver which parses the comma-separated string
        expect(Array.isArray(data?.tags)).toBe(true);
      }
    });
  });
});
