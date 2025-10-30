import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../schema";
import { resolvers } from "../resolvers";
import { PrismaClient } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { Context } from "../../context";

// Types for GraphQL responses
interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface ProjectsQueryData {
  projects?: Project[];
}

interface CreateProjectData {
  createProject?: Project;
}

describe("Project GraphQL Resolvers", () => {
  let server: ApolloServer<Context>;
  let prisma: PrismaClient;
  let pubsub: PubSub;

  beforeAll(async () => {
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
    await prisma.projectUser.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    // Wait a bit to avoid race conditions
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const createTestContext = (): Context => ({
    prisma,
    pubsub,
    req: {} as any,
    res: {} as any,
  });

  describe("Query.projects", () => {
    it("should return empty array when no projects exist", async () => {
      const response = await server.executeOperation(
        {
          query: `
            query {
              projects {
                id
                name
                description
              }
            }
          `,
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.projects).toEqual([]);
      }
    });

    it("should return projects when they exist", async () => {
      // Create test project
      const testProject = await prisma.project.create({
        data: {
          name: "Test Project",
          description: "A test project",
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            query {
              projects {
                id
                name
                description
              }
            }
          `,
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.projects).toHaveLength(1);
        const data = response.body.singleResult.data as ProjectsQueryData;
        expect(data?.projects?.[0]).toMatchObject({
          id: testProject.id,
          name: "Test Project",
          description: "A test project",
        });
      }
    });
  });

  describe("Query.project", () => {
    it("should return project by id", async () => {
      const testProject = await prisma.project.create({
        data: {
          name: "Test Project",
          description: "A test project",
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            query GetProject($id: ID!) {
              project(id: $id) {
                id
                name
                description
              }
            }
          `,
          variables: { id: testProject.id },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.project).toMatchObject({
          id: testProject.id,
          name: "Test Project",
          description: "A test project",
        });
      }
    });

    it("should return null for non-existent project", async () => {
      const response = await server.executeOperation(
        {
          query: `
            query GetProject($id: ID!) {
              project(id: $id) {
                id
                name
              }
            }
          `,
          variables: { id: "non-existent-id" },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.project).toBeNull();
      }
    });
  });

  describe("Mutation.createProject", () => {
    it("should create a new project", async () => {
      const response = await server.executeOperation(
        {
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            input: {
              name: "New Project",
              description: "A new test project",
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
        const data = response.body.singleResult.data as CreateProjectData;
        expect(data?.createProject).toMatchObject({
          name: "New Project",
          description: "A new test project",
        });
        expect(data?.createProject?.id).toBeDefined();
      }

      // Verify project was created in database
      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("New Project");
    });

    it("should create project without description", async () => {
      const response = await server.executeOperation(
        {
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            input: {
              name: "Project Without Description",
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
        expect(response.body.singleResult.data?.createProject).toMatchObject({
          name: "Project Without Description",
          description: null,
        });
      }
    });
  });

  describe("Mutation.updateProject", () => {
    it("should update existing project", async () => {
      const testProject = await prisma.project.create({
        data: {
          name: "Original Name",
          description: "Original description",
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            mutation UpdateProject($id: ID!, $input: CreateProjectInput!) {
              updateProject(id: $id, input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            id: testProject.id,
            input: {
              name: "Updated Name",
              description: "Updated description",
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
        expect(response.body.singleResult.data?.updateProject).toMatchObject({
          id: testProject.id,
          name: "Updated Name",
          description: "Updated description",
        });
      }
    });
  });

  describe("Mutation.deleteProject", () => {
    it("should delete existing project", async () => {
      const testProject = await prisma.project.create({
        data: {
          name: "Project to Delete",
          description: "This project will be deleted",
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            mutation DeleteProject($id: ID!) {
              deleteProject(id: $id)
            }
          `,
          variables: { id: testProject.id },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.deleteProject).toBe(true);
      }

      // Verify project was deleted from database
      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(0);
    });
  });

  describe("Query.project with nested scenes and fixtureValues", () => {
    it("should return channelValues as array not string", async () => {
      // Create test project with fixture, scene, and fixture values
      const testProject = await prisma.project.create({
        data: {
          name: "Test Project",
          description: "Project for testing channelValues",
        },
      });

      // Create a fixture definition
      const fixtureDefinition = await prisma.fixtureDefinition.create({
        data: {
          manufacturer: "Test",
          model: "RGB Par",
          type: "LED_PAR",
        },
      });

      // Create a fixture instance
      const fixture = await prisma.fixtureInstance.create({
        data: {
          name: "Test Fixture",
          definitionId: fixtureDefinition.id,
          manufacturer: "Test",
          model: "RGB Par",
          type: "LED_PAR",
          modeName: "3-channel",
          channelCount: 3,
          projectId: testProject.id,
          universe: 1,
          startChannel: 1,
        },
      });

      // Create channels for the fixture
      await prisma.instanceChannel.createMany({
        data: [
          { fixtureId: fixture.id, offset: 0, name: "Red", type: "RED", defaultValue: 0, minValue: 0, maxValue: 255 },
          { fixtureId: fixture.id, offset: 1, name: "Green", type: "GREEN", defaultValue: 0, minValue: 0, maxValue: 255 },
          { fixtureId: fixture.id, offset: 2, name: "Blue", type: "BLUE", defaultValue: 0, minValue: 0, maxValue: 255 },
        ],
      });

      // Create a scene with fixture values
      // Note: channelValues will be stored as a JSON string in SQLite
      await prisma.scene.create({
        data: {
          name: "Test Scene",
          projectId: testProject.id,
          fixtureValues: {
            create: {
              fixtureId: fixture.id,
              channelValues: JSON.stringify([255, 128, 64]), // Store as string in DB
            },
          },
        },
      });

      // Execute the EXACT query from the frontend
      const response = await server.executeOperation(
        {
          query: `
            query GetProjectScenes($projectId: ID!) {
              project(id: $projectId) {
                id
                scenes {
                  id
                  name
                  fixtureValues {
                    id
                    channelValues
                    fixture {
                      id
                      name
                    }
                  }
                }
              }
            }
          `,
          variables: { projectId: testProject.id },
        },
        {
          contextValue: createTestContext(),
        },
      );

      expect(response.body.kind).toBe("single");
      if (response.body.kind === "single") {
        // Should NOT have errors
        expect(response.body.singleResult.errors).toBeUndefined();

        const data = response.body.singleResult.data as any;
        expect(data?.project).toBeDefined();
        expect(data?.project?.scenes).toHaveLength(1);
        expect(data?.project?.scenes[0].fixtureValues).toHaveLength(1);

        // The key assertion: channelValues should be an array of numbers, not a string
        const channelValues = data?.project?.scenes[0].fixtureValues[0].channelValues;
        expect(Array.isArray(channelValues)).toBe(true);
        expect(channelValues).toEqual([255, 128, 64]);
      }
    });
  });
});
