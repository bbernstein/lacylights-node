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
                  channelValues: [255, 128, 0],
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
                  channelValues: [100, 200, 50],
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
