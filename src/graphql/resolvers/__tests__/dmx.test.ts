import { dmxResolvers } from "../dmx";
import { dmxService } from "../../../services/dmx";
import { fadeEngine } from "../../../services/fadeEngine";
import { getPlaybackStateService } from "../../../services/playbackStateService";
import type { Context } from "../../../context";

// Mock the services
jest.mock("../../../services/dmx", () => ({
  dmxService: {
    getUniverseOutput: jest.fn(),
    getAllUniverseOutputs: jest.fn(),
    getCurrentActiveSceneId: jest.fn(),
    setChannelValue: jest.fn(),
    setActiveScene: jest.fn(),
    clearActiveScene: jest.fn(),
  },
}));

jest.mock("../../../services/fadeEngine", () => ({
  fadeEngine: {
    fadeToScene: jest.fn(),
    fadeToBlack: jest.fn(),
  },
  EasingType: {
    LINEAR: "linear",
    EASE_IN: "easeIn",
    EASE_OUT: "easeOut",
    EASE_IN_OUT: "easeInOut",
  },
}));

jest.mock("../../../services/playbackStateService", () => ({
  getPlaybackStateService: jest.fn(),
}));

const mockContext: Context = {
  prisma: {
    scene: {
      findUnique: jest.fn(),
    },
    cue: {
      findUnique: jest.fn(),
    },
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("DMX Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query", () => {
    describe("dmxOutput", () => {
      it("should return universe output", async () => {
        const mockOutput = new Array(512).fill(0);
        (dmxService.getUniverseOutput as jest.Mock).mockReturnValue(mockOutput);

        const result = await dmxResolvers.Query.dmxOutput({}, { universe: 1 });

        expect(result).toEqual(mockOutput);
        expect(dmxService.getUniverseOutput).toHaveBeenCalledWith(1);
      });
    });

    describe("allDmxOutput", () => {
      it("should return all universe outputs", async () => {
        const mockAllOutputs = [new Array(512).fill(0), new Array(512).fill(0)];
        (dmxService.getAllUniverseOutputs as jest.Mock).mockReturnValue(
          mockAllOutputs,
        );

        const result = await dmxResolvers.Query.allDmxOutput();

        expect(result).toEqual(mockAllOutputs);
        expect(dmxService.getAllUniverseOutputs).toHaveBeenCalled();
      });
    });

    describe("currentActiveScene", () => {
      it("should return current active scene", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          project: { id: "project-1", name: "Test Project" },
          fixtureValues: [],
        };

        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(
          "scene-1",
        );
        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await dmxResolvers.Query.currentActiveScene(
          {},
          {},
          mockContext,
        );

        expect(result).toEqual(mockScene);
        expect(dmxService.getCurrentActiveSceneId).toHaveBeenCalled();
        expect(mockContext.prisma.scene.findUnique).toHaveBeenCalledWith({
          where: { id: "scene-1" },
          include: {
            project: true,
            fixtureValues: {
              include: {
                fixture: true,
              },
            },
          },
        });
      });

      it("should return null when no active scene", async () => {
        (dmxService.getCurrentActiveSceneId as jest.Mock).mockReturnValue(null);

        const result = await dmxResolvers.Query.currentActiveScene(
          {},
          {},
          mockContext,
        );

        expect(result).toBeNull();
        expect(mockContext.prisma.scene.findUnique).not.toHaveBeenCalled();
      });
    });
  });

  describe("Mutation", () => {
    describe("setChannelValue", () => {
      it("should set channel value and return true", async () => {
        const result = await dmxResolvers.Mutation.setChannelValue(
          {},
          { universe: 1, channel: 10, value: 255 },
        );

        expect(result).toBe(true);
        expect(dmxService.setChannelValue).toHaveBeenCalledWith(1, 10, 255);
      });
    });

    describe("setSceneLive", () => {
      it("should set scene live successfully", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Test Scene",
          fixtureValues: [
            {
              fixture: {
                id: "fixture-1",
                startChannel: 1,
                universe: 1,
              },
              channelValues: [255, 128, 0],
            },
            {
              fixture: {
                id: "fixture-2",
                startChannel: 10,
                universe: 1,
              },
              channelValues: [100, 200],
            },
          ],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await dmxResolvers.Mutation.setSceneLive(
          {},
          { sceneId: "scene-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(fadeEngine.fadeToScene).toHaveBeenCalledWith(
          [
            { universe: 1, channel: 1, value: 255 },
            { universe: 1, channel: 2, value: 128 },
            { universe: 1, channel: 3, value: 0 },
            { universe: 1, channel: 10, value: 100 },
            { universe: 1, channel: 11, value: 200 },
          ],
          0,
          "scene-scene-1",
        );
        expect(dmxService.setActiveScene).toHaveBeenCalledWith("scene-1");
      });

      it("should throw error when scene not found", async () => {
        mockContext.prisma.scene.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          dmxResolvers.Mutation.setSceneLive(
            {},
            { sceneId: "non-existent" },
            mockContext,
          ),
        ).rejects.toThrow("Scene with ID non-existent not found");
      });

      it("should handle scene with no fixtures", async () => {
        const mockScene = {
          id: "scene-1",
          name: "Empty Scene",
          fixtureValues: [],
        };

        mockContext.prisma.scene.findUnique = jest
          .fn()
          .mockResolvedValue(mockScene);

        const result = await dmxResolvers.Mutation.setSceneLive(
          {},
          { sceneId: "scene-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(fadeEngine.fadeToScene).toHaveBeenCalledWith(
          [],
          0,
          "scene-scene-1",
        );
        expect(dmxService.setActiveScene).toHaveBeenCalledWith("scene-1");
      });
    });

    describe("playCue", () => {
      const mockPlaybackService = {
        executeCueDmx: jest.fn(),
        startCue: jest.fn(),
      };

      beforeEach(() => {
        (getPlaybackStateService as jest.Mock).mockReturnValue(
          mockPlaybackService,
        );
      });

      it("should play cue successfully with default fade time", async () => {
        const mockCue = {
          id: "cue-1",
          name: "Test Cue",
          fadeInTime: 3.0,
          easingType: "linear",
          scene: {
            id: "scene-1",
            fixtureValues: [
              {
                fixture: {
                  id: "fixture-1",
                  startChannel: 5,
                  universe: 1,
                },
                channelValues: [255, 128],
              },
            ],
          },
          cueList: {
            id: "cuelist-1",
            cues: [
              { id: "cue-1", cueNumber: 1.0 },
              { id: "cue-2", cueNumber: 2.0 },
            ],
          },
        };

        mockContext.prisma.cue.findUnique = jest
          .fn()
          .mockResolvedValue(mockCue);

        const result = await dmxResolvers.Mutation.playCue(
          {},
          { cueId: "cue-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockPlaybackService.executeCueDmx).toHaveBeenCalledWith(
          mockCue,
          undefined,
        );
        expect(mockPlaybackService.startCue).toHaveBeenCalledWith(
          "cuelist-1",
          0,
          mockCue,
        );
      });

      it("should play cue with custom fade time", async () => {
        const mockCue = {
          id: "cue-1",
          name: "Test Cue",
          fadeInTime: 3.0,
          easingType: null,
          scene: {
            id: "scene-1",
            fixtureValues: [],
          },
          cueList: {
            id: "cuelist-1",
            cues: [{ id: "cue-1", cueNumber: 1.0 }],
          },
        };

        mockContext.prisma.cue.findUnique = jest
          .fn()
          .mockResolvedValue(mockCue);

        const result = await dmxResolvers.Mutation.playCue(
          {},
          { cueId: "cue-1", fadeInTime: 1.5 },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockPlaybackService.executeCueDmx).toHaveBeenCalledWith(
          mockCue,
          1.5,
        );
      });

      it("should throw error when cue not found", async () => {
        mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(null);

        await expect(
          dmxResolvers.Mutation.playCue(
            {},
            { cueId: "non-existent" },
            mockContext,
          ),
        ).rejects.toThrow("Cue with ID non-existent not found");
      });

      it("should handle cue not found in cue list (no playback state update)", async () => {
        const mockCue = {
          id: "cue-1",
          name: "Test Cue",
          fadeInTime: 3.0,
          easingType: null,
          scene: {
            id: "scene-1",
            fixtureValues: [],
          },
          cueList: {
            id: "cuelist-1",
            cues: [{ id: "different-cue", cueNumber: 1.0 }],
          },
        };

        mockContext.prisma.cue.findUnique = jest
          .fn()
          .mockResolvedValue(mockCue);

        const result = await dmxResolvers.Mutation.playCue(
          {},
          { cueId: "cue-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockPlaybackService.executeCueDmx).toHaveBeenCalledWith(
          mockCue,
          undefined,
        );
        expect(mockPlaybackService.startCue).not.toHaveBeenCalled();
      });
    });

    describe("fadeToBlack", () => {
      const mockPlaybackService = {
        stopAllCueLists: jest.fn(),
      };

      beforeEach(() => {
        (getPlaybackStateService as jest.Mock).mockReturnValue(
          mockPlaybackService,
        );
      });

      it("should fade to black and clear active scene", async () => {
        const result = await dmxResolvers.Mutation.fadeToBlack(
          {},
          { fadeOutTime: 2.5 },
        );

        expect(result).toBe(true);
        expect(fadeEngine.fadeToBlack).toHaveBeenCalledWith(2.5);
        expect(dmxService.clearActiveScene).toHaveBeenCalled();
        expect(mockPlaybackService.stopAllCueLists).toHaveBeenCalled();
      });

      it("should handle zero fade time", async () => {
        const result = await dmxResolvers.Mutation.fadeToBlack(
          {},
          { fadeOutTime: 0 },
        );

        expect(result).toBe(true);
        expect(fadeEngine.fadeToBlack).toHaveBeenCalledWith(0);
      });
    });
  });
});
