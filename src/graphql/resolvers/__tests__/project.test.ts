import { Context } from "../../../context";
import { projectResolvers } from "../project";

describe("Project Resolvers", () => {
  let mockContext: Context;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      fixtureInstance: {
        findMany: jest.fn(),
      },
      scene: {
        findMany: jest.fn(),
      },
      cueList: {
        findMany: jest.fn(),
      },
    };

    mockContext = {
      prisma: mockPrisma,
      pubsub: {
        asyncIterator: jest.fn(),
        publish: jest.fn(),
      },
    } as any;
  });

  describe("Query resolvers", () => {
    describe("projects", () => {
      it("should fetch all projects with included relations", async () => {
        const mockProjects = [
          {
            id: "1",
            name: "Test Project 1",
            description: "Description 1",
            fixtures: [],
            scenes: [],
            cueLists: [],
            users: [],
          },
          {
            id: "2",
            name: "Test Project 2",
            description: "Description 2",
            fixtures: [],
            scenes: [],
            cueLists: [],
            users: [],
          },
        ];

        mockPrisma.project.findMany.mockResolvedValue(mockProjects);

        const result = await projectResolvers.Query.projects(
          {},
          {},
          mockContext,
        );

        expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
          include: {
            fixtures: true,
            scenes: true,
            cueLists: true,
            users: {
              include: {
                user: true,
              },
            },
          },
        });
        expect(result).toEqual(mockProjects);
      });

      it("should handle empty projects list", async () => {
        mockPrisma.project.findMany.mockResolvedValue([]);

        const result = await projectResolvers.Query.projects(
          {},
          {},
          mockContext,
        );

        expect(result).toEqual([]);
      });
    });

    describe("project", () => {
      it("should fetch a single project by id with included relations", async () => {
        const projectId = "test-project-id";
        const mockProject = {
          id: projectId,
          name: "Test Project",
          description: "Test Description",
          fixtures: [],
          scenes: [],
          cueLists: [],
          users: [],
        };

        mockPrisma.project.findUnique.mockResolvedValue(mockProject);

        const result = await projectResolvers.Query.project(
          {},
          { id: projectId },
          mockContext,
        );

        expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
          where: { id: projectId },
          include: {
            fixtures: true,
            scenes: true,
            cueLists: true,
            users: {
              include: {
                user: true,
              },
            },
          },
        });
        expect(result).toEqual(mockProject);
      });

      it("should return null for non-existent project", async () => {
        const projectId = "non-existent-id";
        mockPrisma.project.findUnique.mockResolvedValue(null);

        const result = await projectResolvers.Query.project(
          {},
          { id: projectId },
          mockContext,
        );

        expect(result).toBeNull();
      });
    });
  });

  describe("Mutation resolvers", () => {
    describe("createProject", () => {
      it("should create a new project with valid input", async () => {
        const input = {
          name: "New Project",
          description: "New project description",
        };
        const mockCreatedProject = {
          id: "new-project-id",
          ...input,
          fixtures: [],
          scenes: [],
          cueLists: [],
          users: [],
        };

        mockPrisma.project.create.mockResolvedValue(mockCreatedProject);

        const result = await projectResolvers.Mutation.createProject(
          {},
          { input },
          mockContext,
        );

        expect(mockPrisma.project.create).toHaveBeenCalledWith({
          data: {
            name: input.name,
            description: input.description,
          },
          include: {
            fixtures: true,
            scenes: true,
            cueLists: true,
            users: {
              include: {
                user: true,
              },
            },
          },
        });
        expect(result).toEqual(mockCreatedProject);
      });

      it("should create project without description", async () => {
        const input = {
          name: "Project Without Description",
        };
        const mockCreatedProject = {
          id: "new-project-id",
          name: input.name,
          description: undefined,
          fixtures: [],
          scenes: [],
          cueLists: [],
          users: [],
        };

        mockPrisma.project.create.mockResolvedValue(mockCreatedProject);

        const result = await projectResolvers.Mutation.createProject(
          {},
          { input },
          mockContext,
        );

        expect(mockPrisma.project.create).toHaveBeenCalledWith({
          data: {
            name: input.name,
            description: undefined,
          },
          include: {
            fixtures: true,
            scenes: true,
            cueLists: true,
            users: {
              include: {
                user: true,
              },
            },
          },
        });
        expect(result).toEqual(mockCreatedProject);
      });
    });

    describe("updateProject", () => {
      it("should update an existing project", async () => {
        const projectId = "existing-project-id";
        const input = {
          name: "Updated Project Name",
          description: "Updated description",
        };
        const mockUpdatedProject = {
          id: projectId,
          ...input,
          fixtures: [],
          scenes: [],
          cueLists: [],
          users: [],
        };

        mockPrisma.project.update.mockResolvedValue(mockUpdatedProject);

        const result = await projectResolvers.Mutation.updateProject(
          {},
          { id: projectId, input },
          mockContext,
        );

        expect(mockPrisma.project.update).toHaveBeenCalledWith({
          where: { id: projectId },
          data: {
            name: input.name,
            description: input.description,
          },
          include: {
            fixtures: true,
            scenes: true,
            cueLists: true,
            users: {
              include: {
                user: true,
              },
            },
          },
        });
        expect(result).toEqual(mockUpdatedProject);
      });
    });

    describe("deleteProject", () => {
      it("should delete a project and return true", async () => {
        const projectId = "project-to-delete";
        mockPrisma.project.delete.mockResolvedValue({ id: projectId });

        const result = await projectResolvers.Mutation.deleteProject(
          {},
          { id: projectId },
          mockContext,
        );

        expect(mockPrisma.project.delete).toHaveBeenCalledWith({
          where: { id: projectId },
        });
        expect(result).toBe(true);
      });
    });
  });

  describe("Type resolvers", () => {
    describe("Project.fixtures", () => {
      it("should fetch fixtures for a project ordered by projectOrder and createdAt", async () => {
        const parentProject = { id: "parent-project-id" };
        const mockFixtures = [
          {
            id: "fixture-1",
            projectId: parentProject.id,
            projectOrder: 1,
            channels: [],
          },
          {
            id: "fixture-2",
            projectId: parentProject.id,
            projectOrder: 2,
            channels: [],
          },
        ];

        mockPrisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures);

        const result = await projectResolvers.types.Project.fixtures(
          parentProject,
          {},
          mockContext,
        );

        expect(mockPrisma.fixtureInstance.findMany).toHaveBeenCalledWith({
          where: { projectId: parentProject.id },
          orderBy: [
            { projectOrder: "asc" },
            { createdAt: "asc" },
          ],
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
          },
        });
        expect(result).toEqual(mockFixtures);
      });
    });

    describe("Project.scenes", () => {
      it("should fetch scenes for a project with fixture values", async () => {
        const parentProject = { id: "parent-project-id" };
        const mockScenes = [
          {
            id: "scene-1",
            projectId: parentProject.id,
            fixtureValues: [
              {
                id: "fixture-value-1",
                fixture: { id: "fixture-1" },
              },
            ],
          },
        ];

        mockPrisma.scene.findMany.mockResolvedValue(mockScenes);

        const result = await projectResolvers.types.Project.scenes(
          parentProject,
          {},
          mockContext,
        );

        expect(mockPrisma.scene.findMany).toHaveBeenCalledWith({
          where: { projectId: parentProject.id },
          include: {
            fixtureValues: {
              include: {
                fixture: true,
              },
            },
          },
        });
        expect(result).toEqual(mockScenes);
      });
    });

    describe("Project.cueLists", () => {
      it("should fetch cue lists for a project with ordered cues", async () => {
        const parentProject = { id: "parent-project-id" };
        const mockCueLists = [
          {
            id: "cue-list-1",
            projectId: parentProject.id,
            cues: [
              {
                id: "cue-1",
                cueNumber: 1.0,
                scene: { id: "scene-1" },
              },
              {
                id: "cue-2",
                cueNumber: 2.0,
                scene: { id: "scene-2" },
              },
            ],
          },
        ];

        mockPrisma.cueList.findMany.mockResolvedValue(mockCueLists);

        const result = await projectResolvers.types.Project.cueLists(
          parentProject,
          {},
          mockContext,
        );

        expect(mockPrisma.cueList.findMany).toHaveBeenCalledWith({
          where: { projectId: parentProject.id },
          include: {
            cues: {
              include: {
                scene: true,
              },
              orderBy: {
                cueNumber: "asc",
              },
            },
          },
        });
        expect(result).toEqual(mockCueLists);
      });
    });
  });

  describe("Subscription resolvers", () => {
    describe("projectUpdated", () => {
      it("should return async iterator for project updates", () => {
        const mockAsyncIterator = jest.fn();
        mockContext.pubsub.asyncIterator = jest
          .fn()
          .mockReturnValue(mockAsyncIterator);

        const result = projectResolvers.Subscription.projectUpdated.subscribe(
          {},
          { projectId: "test-project-id" },
          mockContext,
        );

        expect(mockContext.pubsub.asyncIterator).toHaveBeenCalledWith([
          "PROJECT_UPDATED",
        ]);
        expect(result).toBe(mockAsyncIterator);
      });
    });
  });
});