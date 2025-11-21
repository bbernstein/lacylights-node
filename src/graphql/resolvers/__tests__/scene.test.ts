import { sceneResolvers } from "../scene";
import { dmxService } from "../../../services/dmx";
import { fadeEngine } from "../../../services/fadeEngine";
import type { Context } from "../../../context";

// Mock the services
jest.mock("../../../services/dmx", () => ({
  dmxService: {
    getCurrentActiveSceneId: jest.fn(),
  },
}));

jest.mock("../../../services/fadeEngine", () => ({
  fadeEngine: {
    fadeToScene: jest.fn(),
  },
}));

const mockContext: Context = {
  prisma: {
    scene: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    fixtureValue: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("Scene Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query", () => {
    describe("scenes", () => {
      it("should return paginated lightweight scene list", async () => {
        const mockScenes = [
          {
            id: "scene-1",
            name: "Scene 1",
            description: "Description 1",
            createdAt: new Date("2025-01-01"),
            updatedAt: new Date("2025-01-02"),
            _count: { fixtureValues: 5 },
          },
          {
            id: "scene-2",
            name: "Scene 2",
            description: null,
            createdAt: new Date("2025-01-03"),
            updatedAt: new Date("2025-01-04"),
            _count: { fixtureValues: 3 },
          },
        ];

        mockContext.prisma.scene.findMany = jest
          .fn()
          .mockResolvedValue(mockScenes);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(10);

        const result = await sceneResolvers.Query.scenes(
          {},
          { projectId: "project-1", page: 1, perPage: 2 },
          mockContext,
        );

        expect(result.scenes).toHaveLength(2);
        expect(result.scenes[0]).toEqual({
          id: "scene-1",
          name: "Scene 1",
          description: "Description 1",
          fixtureCount: 5,
          createdAt: mockScenes[0].createdAt,
          updatedAt: mockScenes[0].updatedAt,
        });
        expect(result.pagination).toEqual({
          total: 10,
          page: 1,
          perPage: 2,
          totalPages: 5,
          hasMore: true,
        });
      });

      it("should filter scenes by name", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(0);

        await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            filter: { nameContains: "test" },
          },
          mockContext,
        );

        expect(mockContext.prisma.scene.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              projectId: "project-1",
              name: {
                contains: "test",
                mode: "insensitive",
              },
            }),
          }),
        );
      });

      it("should filter scenes by fixture usage", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(0);

        await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            filter: { usesFixture: "fixture-1" },
          },
          mockContext,
        );

        expect(mockContext.prisma.scene.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              projectId: "project-1",
              fixtureValues: {
                some: {
                  fixtureId: "fixture-1",
                },
              },
            }),
          }),
        );
      });

      it("should sort by NAME", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(0);

        await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            sortBy: "NAME",
          },
          mockContext,
        );

        expect(mockContext.prisma.scene.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { name: "asc" },
          }),
        );
      });

      it("should sort by UPDATED_AT descending", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(0);

        await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            sortBy: "UPDATED_AT",
          },
          mockContext,
        );

        expect(mockContext.prisma.scene.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { updatedAt: "desc" },
          }),
        );
      });

      it("should normalize pagination parameters", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(0);

        await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            page: 0, // Should be normalized to 1
            perPage: 1000, // Should be capped at 100
          },
          mockContext,
        );

        expect(mockContext.prisma.scene.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 0, // (1-1) * 100
            take: 100,
          }),
        );
      });

      it("should calculate pagination info correctly", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(100);

        const result = await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            page: 2,
            perPage: 30,
          },
          mockContext,
        );

        expect(result.pagination).toEqual({
          total: 100,
          page: 2,
          perPage: 30,
          totalPages: 4,
          hasMore: true,
        });
      });

      it("should indicate no more pages on last page", async () => {
        mockContext.prisma.scene.findMany = jest.fn().mockResolvedValue([]);
        mockContext.prisma.scene.count = jest.fn().mockResolvedValue(100);

        const result = await sceneResolvers.Query.scenes(
          {},
          {
            projectId: "project-1",
            page: 4,
            perPage: 30,
          },
          mockContext,
        );

        expect(result.pagination.hasMore).toBe(false);
      });
    });

    describe("scene with includeFixtureValues parameter", () => {
      it("should return scene without fixture values when includeFixtureValues=false", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          description: "Test Description",
          project: { id: "project-1", name: "Test Project" },
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await sceneResolvers.Query.scene(
          {},
          { id: "scene-1", includeFixtureValues: false },
          mockContext,
        );

        expect(result).toEqual(mockScene);
        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          include: {
            project: true,
            fixtureValues: false,
          },
        });
      });

      it("should return scene with fixture values when includeFixtureValues=true", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          fixtureValues: [
            {
              id: "fv-1",
              channelValues: [255, 128, 0],
              fixture: { id: "fixture-1" },
            },
          ],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await sceneResolvers.Query.scene(
          {},
          { id: "scene-1", includeFixtureValues: true },
          mockContext,
        );

        expect(result).toEqual(mockScene);
        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "scene-1" },
            include: expect.objectContaining({
              project: true,
              fixtureValues: expect.any(Object),
            }),
          }),
        );
      });

      it("should default to including fixture values", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          fixtureValues: [],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        await sceneResolvers.Query.scene(
          {},
          { id: "scene-1" }, // No includeFixtureValues parameter
          mockContext,
        );

        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              fixtureValues: expect.any(Object),
            }),
          }),
        );
      });
    });

    describe("sceneFixtures", () => {
      it("should return fixture summary for a scene", async () => {
        const mockFixtureValues = [
          {
            fixtureId: "fixture-1",
            fixture: {
              name: "LED Par 1",
              type: "LED_PAR",
            },
          },
          {
            fixtureId: "fixture-2",
            fixture: {
              name: "Moving Head 1",
              type: "MOVING_HEAD",
            },
          },
        ];

        mockContext.prisma.fixtureValue.findMany = jest
          .fn()
          .mockResolvedValue(mockFixtureValues);

        const result = await sceneResolvers.Query.sceneFixtures(
          {},
          { sceneId: "scene-1" },
          mockContext,
        );

        expect(result).toEqual([
          {
            fixtureId: "fixture-1",
            fixtureName: "LED Par 1",
            fixtureType: "LED_PAR",
          },
          {
            fixtureId: "fixture-2",
            fixtureName: "Moving Head 1",
            fixtureType: "MOVING_HEAD",
          },
        ]);
        expect(mockContext.prisma.fixtureValue.findMany).toHaveBeenCalledWith({
          where: { sceneId: "scene-1" },
          select: {
            fixtureId: true,
            fixture: {
              select: {
                name: true,
                type: true,
              },
            },
          },
          distinct: ["fixtureId"],
        });
      });

      it("should return empty array for scene with no fixtures", async () => {
        mockContext.prisma.fixtureValue.findMany = jest
          .fn()
          .mockResolvedValue([]);

        const result = await sceneResolvers.Query.sceneFixtures(
          {},
          { sceneId: "scene-empty" },
          mockContext,
        );

        expect(result).toEqual([]);
      });
    });

    describe("scene", () => {
      it("should return scene with fixtures and channels", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          description: "Test Description",
          project: { id: "project-1", name: "Test Project" },
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
              fixture: {
                id: "fixture-1",
                channels: [
                  { id: "ch-1", offset: 0, name: "Red" },
                  { id: "ch-2", offset: 1, name: "Green" },
                  { id: "ch-3", offset: 2, name: "Blue" },
                ],
              },
            },
          ],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await sceneResolvers.Query.scene(
          {},
          { id: "scene-1" },
          mockContext,
        );

        expect(result).toEqual(mockScene);
        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          include: {
            project: true,
            fixtureValues: {
              orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
              include: {
                fixture: {
                  include: {
                    channels: {
                      orderBy: { offset: "asc" },
                    },
                  },
                },
              },
            },
          },
        });
      });

      it("should return null for non-existent scene", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        const result = await sceneResolvers.Query.scene(
          {},
          { id: "non-existent" },
          mockContext,
        );

        expect(result).toBeNull();
      });
    });
  });

  describe("Mutation", () => {
    describe("createScene", () => {
      it("should create scene with fixture values", async () => {
        const input = {
          name: "New Scene",
          description: "New Description",
          projectId: "project-1",
          fixtureValues: [
            {
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
            },
          ],
        };

        const mockCreatedScene = {
          id: "scene-new",
          ...input,
          project: { id: "project-1" },
          fixtureValues: [
            {
              id: "fv-new",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
              fixture: { id: "fixture-1", channels: [] },
            },
          ],
        };

        mockContext.prisma.scene.create = jest
          .fn()
          .mockResolvedValue(mockCreatedScene);

        const result = await sceneResolvers.Mutation.createScene(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockCreatedScene);
        expect(mockContext.prisma.scene.create).toHaveBeenCalledWith({
          data: {
            name: "New Scene",
            description: "New Description",
            projectId: "project-1",
            fixtureValues: {
              create: [
                {
                  fixtureId: "fixture-1",
                  channelValues: JSON.stringify([255, 128, 0]),
                  sceneOrder: 1,
                },
              ],
            },
          },
          include: expect.objectContaining({
            project: true,
            fixtureValues: expect.objectContaining({
              orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
            }),
          }),
        });
      });
    });

    describe("updateScene", () => {
      it("should update scene metadata only", async () => {
        const input = {
          name: "Updated Scene",
          description: "Updated Description",
        };

        const mockUpdatedScene = {
          id: "scene-1",
          name: "Updated Scene",
          description: "Updated Description",
          fixtureValues: [],
        };

        mockContext.prisma.scene.update = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);

        const result = await sceneResolvers.Mutation.updateScene(
          {},
          { id: "scene-1", input },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.scene.update).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          data: {
            name: "Updated Scene",
            description: "Updated Description",
          },
          include: expect.any(Object),
        });
        expect(
          mockContext.prisma.fixtureValue.deleteMany,
        ).not.toHaveBeenCalled();
      });

      it("should update scene with fixture values replacement", async () => {
        const input = {
          name: "Updated Scene",
          fixtureValues: [
            {
              fixtureId: "fixture-1",
              channelValues: [100, 200, 50],
              sceneOrder: 1,
            },
          ],
        };

        const mockUpdatedScene = {
          id: "scene-1",
          name: "Updated Scene",
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [100, 200, 50],
              fixture: { startChannel: 1, universe: 1 },
            },
          ],
        };

        mockContext.prisma.fixtureValue.deleteMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });
        mockContext.prisma.scene.update = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(null);

        const result = await sceneResolvers.Mutation.updateScene(
          {},
          { id: "scene-1", input },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.deleteMany).toHaveBeenCalledWith(
          {
            where: { sceneId: "scene-1" },
          },
        );
        expect(mockContext.prisma.scene.update).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          data: {
            name: "Updated Scene",
            fixtureValues: {
              create: [
                {
                  fixtureId: "fixture-1",
                  channelValues: JSON.stringify([100, 200, 50]),
                  sceneOrder: 1,
                },
              ],
            },
          },
          include: expect.any(Object),
        });
      });

      it("should apply updates to DMX when scene is currently active", async () => {
        const input = {
          fixtureValues: [
            {
              fixtureId: "fixture-1",
              channelValues: [100, 200, 50],
              sceneOrder: 1,
            },
          ],
        };

        const mockUpdatedScene = {
          id: "scene-1",
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [100, 200, 50],
              fixture: { startChannel: 5, universe: 1 },
            },
          ],
        };

        mockContext.prisma.fixtureValue.deleteMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });
        mockContext.prisma.scene.update = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(
          "scene-1",
        );

        const result = await sceneResolvers.Mutation.updateScene(
          {},
          { id: "scene-1", input },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(fadeEngine.fadeToScene).toHaveBeenCalledWith(
          [
            { universe: 1, channel: 5, value: 100 },
            { universe: 1, channel: 6, value: 200 },
            { universe: 1, channel: 7, value: 50 },
          ],
          0,
          "scene-scene-1-update",
        );
      });
    });

    describe("duplicateScene", () => {
      it("should duplicate scene with fixture values", async () => {
        const originalScene = {
          id: "scene-1",
          name: "Original Scene",
          description: "Original Description",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
            },
          ],
        };

        const duplicatedScene = {
          id: "scene-copy",
          name: "Original Scene (Copy)",
          description: "Original Description",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-copy",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
              fixture: { id: "fixture-1", channels: [] },
            },
          ],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(originalScene);
        mockContext.prisma.scene.create = jest
          .fn()
          .mockResolvedValue(duplicatedScene);

        const result = await sceneResolvers.Mutation.duplicateScene(
          {},
          { id: "scene-1" },
          mockContext,
        );

        expect(result).toEqual(duplicatedScene);
        expect(mockContext.prisma.scene.create).toHaveBeenCalledWith({
          data: {
            name: "Original Scene (Copy)",
            description: "Original Description",
            projectId: "project-1",
            fixtureValues: {
              create: [
                {
                  fixtureId: "fixture-1",
                  channelValues: [255, 128, 0],
                  sceneOrder: 1,
                },
              ],
            },
          },
          include: expect.any(Object),
        });
      });

      it("should throw error when original scene not found", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          sceneResolvers.Mutation.duplicateScene(
            {},
            { id: "non-existent" },
            mockContext,
          ),
        ).rejects.toThrow("Scene not found");
      });
    });

    describe("cloneScene", () => {
      it("should clone scene with specified name and all fixture values", async () => {
        const originalScene = {
          id: "scene-1",
          name: "Original Scene",
          description: "Original Description",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
            },
            {
              id: "fv-2",
              fixtureId: "fixture-2",
              channelValues: [100, 200, 50, 75],
              sceneOrder: 2,
            },
          ],
        };

        const clonedScene = {
          id: "scene-cloned",
          name: "My Cloned Scene",
          description: "Original Description",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-new-1",
              fixtureId: "fixture-1",
              channelValues: [255, 128, 0],
              sceneOrder: 1,
              fixture: { id: "fixture-1", channels: [] },
            },
            {
              id: "fv-new-2",
              fixtureId: "fixture-2",
              channelValues: [100, 200, 50, 75],
              sceneOrder: 2,
              fixture: { id: "fixture-2", channels: [] },
            },
          ],
          project: { id: "project-1" },
        };

        // Mock the transaction
        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(originalScene),
            create: jest.fn().mockResolvedValue(clonedScene),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        const result = await sceneResolvers.Mutation.cloneScene(
          {},
          { sceneId: "scene-1", newName: "My Cloned Scene" },
          mockContext,
        );

        expect(result).toEqual(clonedScene);
        expect(mockContext.prisma.$transaction).toHaveBeenCalledWith(
          expect.any(Function),
        );
        expect(mockTx.scene.findUnique).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          include: {
            fixtureValues: true,
          },
        });
        expect(mockTx.scene.create).toHaveBeenCalledWith({
          data: {
            name: "My Cloned Scene",
            description: "Original Description",
            projectId: "project-1",
            fixtureValues: {
              create: [
                {
                  fixtureId: "fixture-1",
                  channelValues: [255, 128, 0],
                  sceneOrder: 1,
                },
                {
                  fixtureId: "fixture-2",
                  channelValues: [100, 200, 50, 75],
                  sceneOrder: 2,
                },
              ],
            },
          },
          include: expect.objectContaining({
            project: true,
            fixtureValues: expect.objectContaining({
              orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
            }),
          }),
        });
      });

      it("should throw error when source scene not found", async () => {
        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        await expect(
          sceneResolvers.Mutation.cloneScene(
            {},
            { sceneId: "non-existent", newName: "New Name" },
            mockContext,
          ),
        ).rejects.toThrow("Scene not found");
      });

      it("should handle scenes with many fixtures (100+ fixtures)", async () => {
        // Create a large scene with 150 fixtures
        const fixtureValues = Array.from({ length: 150 }, (_, i) => ({
          id: `fv-${i}`,
          fixtureId: `fixture-${i}`,
          channelValues: [i, i + 1, i + 2],
          sceneOrder: i,
        }));

        const originalScene = {
          id: "large-scene",
          name: "Large Scene",
          description: "Scene with many fixtures",
          projectId: "project-1",
          fixtureValues,
        };

        const clonedScene = {
          id: "scene-cloned",
          name: "Cloned Large Scene",
          description: "Scene with many fixtures",
          projectId: "project-1",
          fixtureValues: fixtureValues.map((fv) => ({
            ...fv,
            id: `new-${fv.id}`,
            fixture: { id: fv.fixtureId, channels: [] },
          })),
          project: { id: "project-1" },
        };

        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(originalScene),
            create: jest.fn().mockResolvedValue(clonedScene),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        const result = await sceneResolvers.Mutation.cloneScene(
          {},
          { sceneId: "large-scene", newName: "Cloned Large Scene" },
          mockContext,
        );

        expect(result).toEqual(clonedScene);
        expect(mockTx.scene.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              fixtureValues: {
                create: expect.arrayContaining([
                  expect.objectContaining({
                    fixtureId: expect.any(String),
                    channelValues: expect.any(Array),
                    sceneOrder: expect.any(Number),
                  }),
                ]),
              },
            }),
          }),
        );
        // Verify all 150 fixtures were copied
        const createCall = mockTx.scene.create.mock.calls[0][0];
        expect(createCall.data.fixtureValues.create).toHaveLength(150);
      });

      it("should preserve all channel values exactly", async () => {
        const originalScene = {
          id: "scene-1",
          name: "Test Scene",
          description: "Test",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-1",
              fixtureId: "fixture-1",
              channelValues: [0, 127, 255, 64, 192, 32, 96, 128],
              sceneOrder: 1,
            },
          ],
        };

        const clonedScene = {
          id: "scene-cloned",
          name: "Cloned Scene",
          description: "Test",
          projectId: "project-1",
          fixtureValues: [
            {
              id: "fv-new",
              fixtureId: "fixture-1",
              channelValues: [0, 127, 255, 64, 192, 32, 96, 128],
              sceneOrder: 1,
              fixture: { id: "fixture-1", channels: [] },
            },
          ],
          project: { id: "project-1" },
        };

        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(originalScene),
            create: jest.fn().mockResolvedValue(clonedScene),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        const result = await sceneResolvers.Mutation.cloneScene(
          {},
          { sceneId: "scene-1", newName: "Cloned Scene" },
          mockContext,
        );

        expect(result).toEqual(clonedScene);
        const createCall = mockTx.scene.create.mock.calls[0][0];
        expect(createCall.data.fixtureValues.create[0].channelValues).toEqual([
          0, 127, 255, 64, 192, 32, 96, 128,
        ]);
      });

      it("should create scene with unique ID", async () => {
        const originalScene = {
          id: "scene-1",
          name: "Original",
          description: null,
          projectId: "project-1",
          fixtureValues: [],
        };

        const clonedScene = {
          id: "scene-unique-id",
          name: "Cloned",
          description: null,
          projectId: "project-1",
          fixtureValues: [],
          project: { id: "project-1" },
        };

        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(originalScene),
            create: jest.fn().mockResolvedValue(clonedScene),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        const result = await sceneResolvers.Mutation.cloneScene(
          {},
          { sceneId: "scene-1", newName: "Cloned" },
          mockContext,
        );

        // Verify the cloned scene has a different ID
        expect(result.id).not.toBe(originalScene.id);
        expect(result.id).toBe("scene-unique-id");
      });

      it("should use transaction for atomicity", async () => {
        const originalScene = {
          id: "scene-1",
          name: "Test",
          description: null,
          projectId: "project-1",
          fixtureValues: [],
        };

        const mockTx = {
          scene: {
            findUnique: jest.fn().mockResolvedValue(originalScene),
            create: jest.fn().mockResolvedValue({
              id: "new",
              name: "New",
              fixtureValues: [],
              project: {},
            }),
          },
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => callback(mockTx));

        await sceneResolvers.Mutation.cloneScene(
          {},
          { sceneId: "scene-1", newName: "New" },
          mockContext,
        );

        // Verify transaction was used
        expect(mockContext.prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe("deleteScene", () => {
      it("should delete scene and return true", async () => {
        mockContext.prisma.scene.delete = jest
          .fn()
          .mockResolvedValue({ id: "scene-1" });

        const result = await sceneResolvers.Mutation.deleteScene(
          {},
          { id: "scene-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockContext.prisma.scene.delete).toHaveBeenCalledWith({
          where: { id: "scene-1" },
        });
      });
    });

    describe("addFixturesToScene", () => {
      const mockExistingScene = { id: "scene-1", name: "Test Scene" };
      const mockUpdatedScene = {
        id: "scene-1",
        fixtureValues: [],
        project: {},
      };

      beforeEach(() => {
        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValueOnce(mockExistingScene) // for verification
          .mockResolvedValueOnce(mockUpdatedScene); // for return
      });

      it("should add fixtures to scene with overwrite", async () => {
        const fixtureValues = [
          {
            fixtureId: "fixture-1",
            channelValues: [255, 128, 0],
            sceneOrder: 1,
          },
        ];

        // Mock existing fixture values
        mockContext.prisma.fixtureValue.findMany = jest.fn().mockResolvedValue([
          {
            id: "existing-fv",
            fixtureId: "fixture-1",
            channelValues: [100, 100, 100],
          },
        ]);

        // Mock the update promise
        mockContext.prisma.fixtureValue.update = jest
          .fn()
          .mockResolvedValue({});

        const result = await sceneResolvers.Mutation.addFixturesToScene(
          {},
          {
            sceneId: "scene-1",
            fixtureValues,
            overwriteExisting: true,
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.update).toHaveBeenCalledWith({
          where: { id: "existing-fv" },
          data: {
            channelValues: [255, 128, 0],
            sceneOrder: 1,
          },
        });
      });

      it("should add new fixtures without overwriting existing ones", async () => {
        const fixtureValues = [
          {
            fixtureId: "fixture-new",
            channelValues: [255, 128, 0],
            sceneOrder: 2,
          },
        ];

        mockContext.prisma.fixtureValue.findMany = jest
          .fn()
          .mockResolvedValue([]);
        mockContext.prisma.fixtureValue.createMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });

        const result = await sceneResolvers.Mutation.addFixturesToScene(
          {},
          {
            sceneId: "scene-1",
            fixtureValues,
            overwriteExisting: false,
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.createMany).toHaveBeenCalledWith(
          {
            data: [
              {
                sceneId: "scene-1",
                fixtureId: "fixture-new",
                channelValues: [255, 128, 0],
                sceneOrder: 2,
              },
            ],
          },
        );
      });

      it("should throw error when scene not found", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          sceneResolvers.Mutation.addFixturesToScene(
            {},
            {
              sceneId: "non-existent",
              fixtureValues: [],
            },
            mockContext,
          ),
        ).rejects.toThrow("Scene with ID non-existent not found");
      });
    });

    describe("removeFixturesFromScene", () => {
      it("should remove fixtures from scene", async () => {
        const mockScene = { id: "scene-1", name: "Test Scene" };
        const mockUpdatedScene = {
          id: "scene-1",
          fixtureValues: [],
          project: {},
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValueOnce(mockScene) // for verification
          .mockResolvedValueOnce(mockUpdatedScene); // for return

        mockContext.prisma.fixtureValue.deleteMany = jest
          .fn()
          .mockResolvedValue({ count: 2 });

        const result = await sceneResolvers.Mutation.removeFixturesFromScene(
          {},
          {
            sceneId: "scene-1",
            fixtureIds: ["fixture-1", "fixture-2"],
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.deleteMany).toHaveBeenCalledWith(
          {
            where: {
              sceneId: "scene-1",
              fixtureId: {
                in: ["fixture-1", "fixture-2"],
              },
            },
          },
        );
      });

      it("should throw error when scene not found", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          sceneResolvers.Mutation.removeFixturesFromScene(
            {},
            {
              sceneId: "non-existent",
              fixtureIds: ["fixture-1"],
            },
            mockContext,
          ),
        ).rejects.toThrow("Scene with ID non-existent not found");
      });
    });

    describe("updateScenePartial", () => {
      const mockUpdatedScene = {
        id: "scene-1",
        name: "Updated Scene",
        fixtureValues: [
          {
            id: "fv-1",
            fixtureId: "fixture-1",
            channelValues: [255, 128, 0],
            fixture: { startChannel: 1, universe: 1 },
          },
        ],
      };

      it("should update metadata only when no fixture values provided", async () => {
        mockContext.prisma.scene.update = jest.fn().mockResolvedValue({});
        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);

        const result = await sceneResolvers.Mutation.updateScenePartial(
          {},
          {
            sceneId: "scene-1",
            name: "Updated Scene",
            description: "Updated Description",
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.scene.update).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          data: {
            name: "Updated Scene",
            description: "Updated Description",
          },
        });
      });

      it("should merge fixtures when mergeFixtures is true", async () => {
        const fixtureValues = [
          {
            fixtureId: "fixture-1",
            channelValues: [255, 128, 0],
            sceneOrder: 1,
          },
        ];

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);
        mockContext.prisma.fixtureValue.findMany = jest
          .fn()
          .mockResolvedValue([]);
        mockContext.prisma.fixtureValue.createMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(null);

        const result = await sceneResolvers.Mutation.updateScenePartial(
          {},
          {
            sceneId: "scene-1",
            fixtureValues,
            mergeFixtures: true,
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.createMany).toHaveBeenCalled();
        expect(
          mockContext.prisma.fixtureValue.deleteMany,
        ).not.toHaveBeenCalled();
      });

      it("should replace all fixtures when mergeFixtures is false", async () => {
        const fixtureValues = [
          {
            fixtureId: "fixture-1",
            channelValues: [255, 128, 0],
            sceneOrder: 1,
          },
        ];

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);
        mockContext.prisma.fixtureValue.deleteMany = jest
          .fn()
          .mockResolvedValue({ count: 2 });
        mockContext.prisma.fixtureValue.createMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(null);

        const result = await sceneResolvers.Mutation.updateScenePartial(
          {},
          {
            sceneId: "scene-1",
            fixtureValues,
            mergeFixtures: false,
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(mockContext.prisma.fixtureValue.deleteMany).toHaveBeenCalledWith(
          {
            where: { sceneId: "scene-1" },
          },
        );
        expect(mockContext.prisma.fixtureValue.createMany).toHaveBeenCalled();
      });

      it("should apply DMX updates when scene is active", async () => {
        const fixtureValues = [
          {
            fixtureId: "fixture-1",
            channelValues: [255, 128, 0],
            sceneOrder: 1,
          },
        ];

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockUpdatedScene);
        mockContext.prisma.fixtureValue.findMany = jest
          .fn()
          .mockResolvedValue([]);
        mockContext.prisma.fixtureValue.createMany = jest
          .fn()
          .mockResolvedValue({ count: 1 });
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(
          "scene-1",
        );

        const result = await sceneResolvers.Mutation.updateScenePartial(
          {},
          {
            sceneId: "scene-1",
            fixtureValues,
            mergeFixtures: true,
          },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedScene);
        expect(fadeEngine.fadeToScene).toHaveBeenCalledWith(
          [
            { universe: 1, channel: 1, value: 255 },
            { universe: 1, channel: 2, value: 128 },
            { universe: 1, channel: 3, value: 0 },
          ],
          0,
          "scene-scene-1-partial-update",
        );
      });
    });
  });
});
