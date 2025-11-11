import { sceneBoardResolvers } from "../sceneBoard";
import { dmxService } from "../../../services/dmx";
import { fadeEngine, EasingType } from "../../../services/fadeEngine";
import type { Context } from "../../../context";

// Mock the services
jest.mock("../../../services/dmx", () => ({
  dmxService: {
    setActiveScene: jest.fn(),
  },
}));

jest.mock("../../../services/fadeEngine", () => ({
  fadeEngine: {
    fadeChannels: jest.fn(),
  },
  EasingType: {
    LINEAR: "LINEAR",
    CUBIC: "CUBIC",
    SINE: "SINE",
    EXPONENTIAL: "EXPONENTIAL",
    S_CURVE: "S_CURVE",
  },
}));

const mockContext: Context = {
  prisma: {
    sceneBoard: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sceneBoardButton: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    scene: {
      findUnique: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("Scene Board Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query", () => {
    describe("sceneBoards", () => {
      it("should return all scene boards for a project", async () => {
        const mockBoards = [
          {
            id: "board-1",
            name: "Main Board",
            description: "Main lighting board",
            projectId: "project-1",
            defaultFadeTime: 3.0,
            gridSize: 50,
            createdAt: new Date("2025-01-01"),
            updatedAt: new Date("2025-01-02"),
            buttons: [],
            project: { id: "project-1", name: "Test Project" },
          },
        ];

        mockContext.prisma.sceneBoard.findMany = jest
          .fn()
          .mockResolvedValue(mockBoards);

        const result = await sceneBoardResolvers.Query.sceneBoards(
          {},
          { projectId: "project-1" },
          mockContext,
        );

        expect(result).toEqual(mockBoards);
        expect(mockContext.prisma.sceneBoard.findMany).toHaveBeenCalledWith({
          where: { projectId: "project-1" },
          include: {
            buttons: {
              include: {
                scene: {
                  include: {
                    fixtureValues: {
                      include: {
                        fixture: true,
                      },
                    },
                  },
                },
              },
            },
            project: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      });
    });

    describe("sceneBoard", () => {
      it("should return a single scene board by id", async () => {
        const mockBoard = {
          id: "board-1",
          name: "Main Board",
          description: "Main lighting board",
          projectId: "project-1",
          defaultFadeTime: 3.0,
          gridSize: 50,
          buttons: [],
          project: { id: "project-1", name: "Test Project" },
        };

        mockContext.prisma.sceneBoard.findUnique = jest
          .fn()
          .mockResolvedValue(mockBoard);

        const result = await sceneBoardResolvers.Query.sceneBoard(
          {},
          { id: "board-1" },
          mockContext,
        );

        expect(result).toEqual(mockBoard);
        expect(mockContext.prisma.sceneBoard.findUnique).toHaveBeenCalledWith({
          where: { id: "board-1" },
          include: {
            buttons: {
              include: {
                scene: {
                  include: {
                    fixtureValues: {
                      include: {
                        fixture: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
            project: true,
          },
        });
      });
    });

    describe("sceneBoardButton", () => {
      it("should return a single button by id", async () => {
        const mockButton = {
          id: "button-1",
          sceneBoardId: "board-1",
          sceneId: "scene-1",
          layoutX: 0.5,
          layoutY: 0.5,
          width: 0.1,
          height: 0.1,
        };

        mockContext.prisma.sceneBoardButton.findUnique = jest
          .fn()
          .mockResolvedValue(mockButton);

        const result = await sceneBoardResolvers.Query.sceneBoardButton(
          {},
          { id: "button-1" },
          mockContext,
        );

        expect(result).toEqual(mockButton);
        expect(
          mockContext.prisma.sceneBoardButton.findUnique,
        ).toHaveBeenCalledWith({
          where: { id: "button-1" },
          include: {
            sceneBoard: true,
            scene: true,
          },
        });
      });
    });
  });

  describe("Mutation", () => {
    describe("createSceneBoard", () => {
      it("should create a new scene board with default values", async () => {
        const input = {
          name: "New Board",
          description: "A new board",
          projectId: "project-1",
        };

        const mockCreatedBoard = {
          id: "board-1",
          ...input,
          defaultFadeTime: 3.0,
          gridSize: 50,
          buttons: [],
          project: { id: "project-1", name: "Test Project" },
        };

        mockContext.prisma.sceneBoard.create = jest
          .fn()
          .mockResolvedValue(mockCreatedBoard);

        const result = await sceneBoardResolvers.Mutation.createSceneBoard(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockCreatedBoard);
        expect(mockContext.prisma.sceneBoard.create).toHaveBeenCalledWith({
          data: {
            name: input.name,
            description: input.description,
            projectId: input.projectId,
            defaultFadeTime: 3.0,
            gridSize: 50,
          },
          include: {
            buttons: {
              include: {
                scene: true,
              },
            },
            project: true,
          },
        });
      });

      it("should create a scene board with custom fade time and grid size", async () => {
        const input = {
          name: "Custom Board",
          projectId: "project-1",
          defaultFadeTime: 5.0,
          gridSize: 100,
        };

        mockContext.prisma.sceneBoard.create = jest.fn().mockResolvedValue({
          id: "board-1",
          ...input,
        });

        await sceneBoardResolvers.Mutation.createSceneBoard(
          {},
          { input },
          mockContext,
        );

        expect(mockContext.prisma.sceneBoard.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              defaultFadeTime: 5.0,
              gridSize: 100,
            }),
          }),
        );
      });
    });

    describe("updateSceneBoard", () => {
      it("should update scene board properties", async () => {
        const input = {
          name: "Updated Board",
          defaultFadeTime: 2.0,
        };

        const mockUpdatedBoard = {
          id: "board-1",
          ...input,
          projectId: "project-1",
        };

        mockContext.prisma.sceneBoard.update = jest
          .fn()
          .mockResolvedValue(mockUpdatedBoard);

        const result = await sceneBoardResolvers.Mutation.updateSceneBoard(
          {},
          { id: "board-1", input },
          mockContext,
        );

        expect(result).toEqual(mockUpdatedBoard);
        expect(mockContext.prisma.sceneBoard.update).toHaveBeenCalledWith({
          where: { id: "board-1" },
          data: {
            name: input.name,
            defaultFadeTime: input.defaultFadeTime,
          },
          include: {
            buttons: {
              include: {
                scene: true,
              },
            },
            project: true,
          },
        });
      });

      it("should only update provided fields", async () => {
        const input = {
          name: "Updated Name Only",
        };

        mockContext.prisma.sceneBoard.update = jest
          .fn()
          .mockResolvedValue({ id: "board-1", ...input });

        await sceneBoardResolvers.Mutation.updateSceneBoard(
          {},
          { id: "board-1", input },
          mockContext,
        );

        expect(mockContext.prisma.sceneBoard.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              name: input.name,
            },
          }),
        );
      });
    });

    describe("deleteSceneBoard", () => {
      it("should delete a scene board", async () => {
        mockContext.prisma.sceneBoard.delete = jest.fn().mockResolvedValue({});

        const result = await sceneBoardResolvers.Mutation.deleteSceneBoard(
          {},
          { id: "board-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockContext.prisma.sceneBoard.delete).toHaveBeenCalledWith({
          where: { id: "board-1" },
        });
      });
    });

    describe("addSceneToBoard", () => {
      it("should add a scene button to a board", async () => {
        const input = {
          sceneBoardId: "board-1",
          sceneId: "scene-1",
          layoutX: 0.5,
          layoutY: 0.5,
          width: 0.1,
          height: 0.1,
        };

        mockContext.prisma.sceneBoardButton.findFirst = jest
          .fn()
          .mockResolvedValue(null);

        const mockCreatedButton = {
          id: "button-1",
          ...input,
        };

        mockContext.prisma.sceneBoardButton.create = jest
          .fn()
          .mockResolvedValue(mockCreatedButton);

        const result = await sceneBoardResolvers.Mutation.addSceneToBoard(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockCreatedButton);
        expect(
          mockContext.prisma.sceneBoardButton.findFirst,
        ).toHaveBeenCalledWith({
          where: {
            sceneBoardId: input.sceneBoardId,
            sceneId: input.sceneId,
          },
        });
        expect(mockContext.prisma.sceneBoardButton.create).toHaveBeenCalledWith(
          {
            data: {
              sceneBoardId: input.sceneBoardId,
              sceneId: input.sceneId,
              layoutX: input.layoutX,
              layoutY: input.layoutY,
              width: input.width,
              height: input.height,
              color: undefined,
              label: undefined,
            },
            include: {
              sceneBoard: true,
              scene: true,
            },
          },
        );
      });

      it("should throw error if scene already exists on board", async () => {
        const input = {
          sceneBoardId: "board-1",
          sceneId: "scene-1",
          layoutX: 0.5,
          layoutY: 0.5,
        };

        mockContext.prisma.sceneBoardButton.findFirst = jest
          .fn()
          .mockResolvedValue({ id: "existing-button" });

        await expect(
          sceneBoardResolvers.Mutation.addSceneToBoard({}, { input }, mockContext),
        ).rejects.toThrow("Scene already exists on this board");
      });

      it("should use default width and height if not provided", async () => {
        const input = {
          sceneBoardId: "board-1",
          sceneId: "scene-1",
          layoutX: 0.5,
          layoutY: 0.5,
        };

        mockContext.prisma.sceneBoardButton.findFirst = jest
          .fn()
          .mockResolvedValue(null);
        mockContext.prisma.sceneBoardButton.create = jest
          .fn()
          .mockResolvedValue({ id: "button-1", ...input });

        await sceneBoardResolvers.Mutation.addSceneToBoard(
          {},
          { input },
          mockContext,
        );

        expect(mockContext.prisma.sceneBoardButton.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              width: 0.1,
              height: 0.1,
            }),
          }),
        );
      });
    });

    describe("updateSceneBoardButton", () => {
      it("should update button properties", async () => {
        const input = {
          layoutX: 0.7,
          layoutY: 0.3,
          color: "#FF0000",
          label: "Custom Label",
        };

        const mockUpdatedButton = {
          id: "button-1",
          ...input,
        };

        mockContext.prisma.sceneBoardButton.update = jest
          .fn()
          .mockResolvedValue(mockUpdatedButton);

        const result =
          await sceneBoardResolvers.Mutation.updateSceneBoardButton(
            {},
            { id: "button-1", input },
            mockContext,
          );

        expect(result).toEqual(mockUpdatedButton);
        expect(mockContext.prisma.sceneBoardButton.update).toHaveBeenCalledWith(
          {
            where: { id: "button-1" },
            data: {
              layoutX: input.layoutX,
              layoutY: input.layoutY,
              color: input.color,
              label: input.label,
            },
            include: {
              sceneBoard: true,
              scene: true,
            },
          },
        );
      });
    });

    describe("removeSceneFromBoard", () => {
      it("should remove a button from the board", async () => {
        mockContext.prisma.sceneBoardButton.delete = jest
          .fn()
          .mockResolvedValue({});

        const result = await sceneBoardResolvers.Mutation.removeSceneFromBoard(
          {},
          { buttonId: "button-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockContext.prisma.sceneBoardButton.delete).toHaveBeenCalledWith({
          where: { id: "button-1" },
        });
      });
    });

    describe("updateSceneBoardButtonPositions", () => {
      it("should batch update button positions using transaction", async () => {
        const positions = [
          { buttonId: "button-1", layoutX: 0.2, layoutY: 0.3 },
          { buttonId: "button-2", layoutX: 0.5, layoutY: 0.6 },
        ];

        mockContext.prisma.$transaction = jest.fn().mockResolvedValue([]);

        const result =
          await sceneBoardResolvers.Mutation.updateSceneBoardButtonPositions(
            {},
            { positions },
            mockContext,
          );

        expect(result).toBe(true);
        expect(mockContext.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockContext.prisma.$transaction).toHaveBeenCalledWith(
          expect.any(Array),
        );

        // Verify that $transaction was called with an array of length 2
        const transactionCall = (mockContext.prisma.$transaction as jest.Mock).mock.calls[0][0];
        expect(transactionCall).toHaveLength(2);
      });
    });

    describe("activateSceneFromBoard", () => {
      const mockSceneBoard = {
        id: "board-1",
        defaultFadeTime: 3.0,
      };

      const mockScene = {
        id: "scene-1",
        fixtureValues: [
          {
            fixture: {
              universe: 1,
              startChannel: 1,
            },
            channelValues: [255, 128, 64],
          },
          {
            fixture: {
              universe: 1,
              startChannel: 10,
            },
            channelValues: JSON.stringify([100, 200]),
          },
        ],
      };

      beforeEach(() => {
        mockContext.prisma.sceneBoard.findUnique = jest
          .fn()
          .mockResolvedValue(mockSceneBoard);
        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);
      });

      it("should activate scene with default fade time", async () => {
        const result =
          await sceneBoardResolvers.Mutation.activateSceneFromBoard(
            {},
            { sceneBoardId: "board-1", sceneId: "scene-1" },
            mockContext,
          );

        expect(result).toBe(true);
        expect(fadeEngine.fadeChannels).toHaveBeenCalledWith(
          expect.arrayContaining([
            { universe: 1, channel: 1, targetValue: 255 },
            { universe: 1, channel: 2, targetValue: 128 },
            { universe: 1, channel: 3, targetValue: 64 },
            { universe: 1, channel: 10, targetValue: 100 },
            { universe: 1, channel: 11, targetValue: 200 },
          ]),
          3.0,
          "scene-board-board-1",
          undefined,
          EasingType.LINEAR,
        );
        expect(dmxService.setActiveScene).toHaveBeenCalledWith("scene-1");
      });

      it("should activate scene with fade time override", async () => {
        await sceneBoardResolvers.Mutation.activateSceneFromBoard(
          {},
          {
            sceneBoardId: "board-1",
            sceneId: "scene-1",
            fadeTimeOverride: 5.0,
          },
          mockContext,
        );

        expect(fadeEngine.fadeChannels).toHaveBeenCalledWith(
          expect.any(Array),
          5.0,
          "scene-board-board-1",
          undefined,
          EasingType.LINEAR,
        );
      });

      it("should throw error if scene board not found", async () => {
        mockContext.prisma.sceneBoard.findUnique = jest
          .fn()
          .mockResolvedValue(null);

        await expect(
          sceneBoardResolvers.Mutation.activateSceneFromBoard(
            {},
            { sceneBoardId: "board-1", sceneId: "scene-1" },
            mockContext,
          ),
        ).rejects.toThrow("Scene board not found");
      });

      it("should throw error if scene not found", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          sceneBoardResolvers.Mutation.activateSceneFromBoard(
            {},
            { sceneBoardId: "board-1", sceneId: "scene-1" },
            mockContext,
          ),
        ).rejects.toThrow("Scene not found");
      });

      it("should handle both array and string channelValues", async () => {
        const mixedScene = {
          id: "scene-1",
          fixtureValues: [
            {
              fixture: { universe: 1, startChannel: 1 },
              channelValues: [255, 128], // Array
            },
            {
              fixture: { universe: 1, startChannel: 5 },
              channelValues: JSON.stringify([100, 50]), // String
            },
          ],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mixedScene);

        await sceneBoardResolvers.Mutation.activateSceneFromBoard(
          {},
          { sceneBoardId: "board-1", sceneId: "scene-1" },
          mockContext,
        );

        expect(fadeEngine.fadeChannels).toHaveBeenCalledWith(
          expect.arrayContaining([
            { universe: 1, channel: 1, targetValue: 255 },
            { universe: 1, channel: 2, targetValue: 128 },
            { universe: 1, channel: 5, targetValue: 100 },
            { universe: 1, channel: 6, targetValue: 50 },
          ]),
          expect.any(Number),
          expect.any(String),
          undefined,
          EasingType.LINEAR,
        );
      });
    });
  });

  describe("Type Resolvers", () => {
    describe("SceneBoard.buttons", () => {
      it("should resolve buttons for a scene board", async () => {
        const mockButtons = [
          { id: "button-1", sceneBoardId: "board-1" },
          { id: "button-2", sceneBoardId: "board-1" },
        ];

        mockContext.prisma.sceneBoardButton.findMany = jest
          .fn()
          .mockResolvedValue(mockButtons);

        const result = await sceneBoardResolvers.types.SceneBoard.buttons(
          { id: "board-1" },
          {},
          mockContext,
        );

        expect(result).toEqual(mockButtons);
        expect(
          mockContext.prisma.sceneBoardButton.findMany,
        ).toHaveBeenCalledWith({
          where: { sceneBoardId: "board-1" },
          include: {
            scene: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      });
    });

    describe("SceneBoard.project", () => {
      it("should resolve project for a scene board", async () => {
        const mockProject = { id: "project-1", name: "Test Project" };

        mockContext.prisma.project.findUnique = jest
          .fn()
          .mockResolvedValue(mockProject);

        const result = await sceneBoardResolvers.types.SceneBoard.project(
          { projectId: "project-1" },
          {},
          mockContext,
        );

        expect(result).toEqual(mockProject);
        expect(mockContext.prisma.project.findUnique).toHaveBeenCalledWith({
          where: { id: "project-1" },
        });
      });
    });

    describe("SceneBoardButton.sceneBoard", () => {
      it("should resolve scene board for a button", async () => {
        const mockSceneBoard = { id: "board-1", name: "Main Board" };

        mockContext.prisma.sceneBoard.findUnique = jest
          .fn()
          .mockResolvedValue(mockSceneBoard);

        const result =
          await sceneBoardResolvers.types.SceneBoardButton.sceneBoard(
            { sceneBoardId: "board-1" },
            {},
            mockContext,
          );

        expect(result).toEqual(mockSceneBoard);
        expect(mockContext.prisma.sceneBoard.findUnique).toHaveBeenCalledWith({
          where: { id: "board-1" },
        });
      });
    });

    describe("SceneBoardButton.scene", () => {
      it("should resolve scene for a button", async () => {
        const mockScene = { id: "scene-1", name: "Scene 1" };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await sceneBoardResolvers.types.SceneBoardButton.scene(
          { sceneId: "scene-1" },
          {},
          mockContext,
        );

        expect(result).toEqual(mockScene);
        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          include: {
            fixtureValues: {
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
    });

    describe("Project.sceneBoards", () => {
      it("should resolve scene boards for a project", async () => {
        const mockBoards = [
          { id: "board-1", projectId: "project-1" },
          { id: "board-2", projectId: "project-1" },
        ];

        mockContext.prisma.sceneBoard.findMany = jest
          .fn()
          .mockResolvedValue(mockBoards);

        const result = await sceneBoardResolvers.types.Project.sceneBoards(
          { id: "project-1" },
          {},
          mockContext,
        );

        expect(result).toEqual(mockBoards);
        expect(mockContext.prisma.sceneBoard.findMany).toHaveBeenCalledWith({
          where: { projectId: "project-1" },
          include: {
            buttons: {
              include: {
                scene: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      });
    });
  });
});
