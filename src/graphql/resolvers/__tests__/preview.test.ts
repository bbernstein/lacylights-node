import { previewResolvers } from "../preview";
import { previewService } from "../../../services/previewService";
import type { Context } from "../../../context";

// Mock the preview service
jest.mock("../../../services/previewService", () => {
  const mockService = {
    getPreviewSession: jest.fn(),
    startPreviewSession: jest.fn(),
    commitPreviewSession: jest.fn(),
    cancelPreviewSession: jest.fn(),
    updateChannelValue: jest.fn(),
    initializeWithScene: jest.fn(),
  };
  return {
    previewService: mockService,
    getPreviewService: () => mockService,
  };
});

const mockContext: Context = {
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("Preview Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query", () => {
    describe("previewSession", () => {
      it("should return preview session with project details", async () => {
        const mockSession = {
          id: "session-1",
          projectId: "project-1",
          isActive: true,
          createdAt: new Date("2023-01-01T12:00:00Z"),
          channelOverrides: new Map([
            ["1:1", 255],
            ["1:2", 128],
          ]),
        };

        const mockProject = {
          id: "project-1",
          name: "Test Project",
        };

        (previewService.getPreviewSession as jest.Mock).mockResolvedValue(
          mockSession,
        );
        mockContext.prisma.project.findUnique = jest
          .fn()
          .mockResolvedValue(mockProject);

        const result = await previewResolvers.Query.previewSession(
          {},
          { sessionId: "session-1" },
          mockContext,
        );

        expect(result).toEqual({
          id: "session-1",
          project: mockProject,
          user: null,
          isActive: true,
          createdAt: "2023-01-01T12:00:00.000Z",
          dmxOutput: [
            {
              universe: 1,
              channels: expect.arrayContaining([255, 128]),
            },
          ],
        });

        expect(previewService.getPreviewSession).toHaveBeenCalledWith(
          "session-1",
        );
        expect(mockContext.prisma.project.findUnique).toHaveBeenCalledWith({
          where: { id: "project-1" },
        });
      });

      it("should throw error when session not found", async () => {
        (previewService.getPreviewSession as jest.Mock).mockResolvedValue(null);

        await expect(
          previewResolvers.Query.previewSession(
            {},
            { sessionId: "non-existent" },
            mockContext,
          ),
        ).rejects.toThrow("Preview session not found");
      });

      it("should handle session with no channel overrides", async () => {
        const mockSession = {
          id: "session-1",
          projectId: "project-1",
          isActive: true,
          createdAt: new Date("2023-01-01T12:00:00Z"),
          channelOverrides: new Map(),
        };

        const mockProject = {
          id: "project-1",
          name: "Test Project",
        };

        (previewService.getPreviewSession as jest.Mock).mockResolvedValue(
          mockSession,
        );
        mockContext.prisma.project.findUnique = jest
          .fn()
          .mockResolvedValue(mockProject);

        const result = await previewResolvers.Query.previewSession(
          {},
          { sessionId: "session-1" },
          mockContext,
        );

        expect(result.dmxOutput).toEqual([]);
      });
    });
  });

  describe("Mutation", () => {
    describe("startPreviewSession", () => {
      it("should start preview session for existing project", async () => {
        const mockProject = {
          id: "project-1",
          name: "Test Project",
        };

        const mockSession = {
          id: "session-1",
          projectId: "project-1",
          isActive: true,
          createdAt: new Date("2023-01-01T12:00:00Z"),
          channelOverrides: new Map(),
        };

        mockContext.prisma.project.findUnique = jest
          .fn()
          .mockResolvedValue(mockProject);
        (previewService.startPreviewSession as jest.Mock).mockResolvedValue(
          mockSession,
        );

        const result = await previewResolvers.Mutation.startPreviewSession(
          {},
          { projectId: "project-1" },
          mockContext,
        );

        expect(result).toEqual({
          id: "session-1",
          project: mockProject,
          user: null,
          isActive: true,
          createdAt: "2023-01-01T12:00:00.000Z",
          dmxOutput: [],
        });

        expect(mockContext.prisma.project.findUnique).toHaveBeenCalledWith({
          where: { id: "project-1" },
        });
        expect(previewService.startPreviewSession).toHaveBeenCalledWith(
          "project-1",
        );
      });

      it("should throw error when project not found", async () => {
        mockContext.prisma.project.findUnique = jest
          .fn()
          .mockResolvedValue(null);

        await expect(
          previewResolvers.Mutation.startPreviewSession(
            {},
            { projectId: "non-existent" },
            mockContext,
          ),
        ).rejects.toThrow("Project not found");
      });
    });

    describe("commitPreviewSession", () => {
      it("should commit preview session", async () => {
        (previewService.commitPreviewSession as jest.Mock).mockResolvedValue(
          true,
        );

        const result = await previewResolvers.Mutation.commitPreviewSession(
          {},
          { sessionId: "session-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(previewService.commitPreviewSession).toHaveBeenCalledWith(
          "session-1",
        );
      });
    });

    describe("cancelPreviewSession", () => {
      it("should cancel preview session", async () => {
        (previewService.cancelPreviewSession as jest.Mock).mockResolvedValue(
          true,
        );

        const result = await previewResolvers.Mutation.cancelPreviewSession(
          {},
          { sessionId: "session-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(previewService.cancelPreviewSession).toHaveBeenCalledWith(
          "session-1",
        );
      });
    });

    describe("updatePreviewChannel", () => {
      it("should update preview channel value", async () => {
        (previewService.updateChannelValue as jest.Mock).mockResolvedValue(
          true,
        );

        const result = await previewResolvers.Mutation.updatePreviewChannel(
          {},
          {
            sessionId: "session-1",
            fixtureId: "fixture-1",
            channelIndex: 0,
            value: 255,
          },
          mockContext,
        );

        expect(result).toBe(true);
        expect(previewService.updateChannelValue).toHaveBeenCalledWith(
          "session-1",
          "fixture-1",
          0,
          255,
        );
      });
    });

    describe("initializePreviewWithScene", () => {
      it("should initialize preview with scene", async () => {
        (previewService.initializeWithScene as jest.Mock).mockResolvedValue(
          true,
        );

        const result =
          await previewResolvers.Mutation.initializePreviewWithScene(
            {},
            { sessionId: "session-1", sceneId: "scene-1" },
            mockContext,
          );

        expect(result).toBe(true);
        expect(previewService.initializeWithScene).toHaveBeenCalledWith(
          "session-1",
          "scene-1",
        );
      });
    });
  });

  describe("Subscription", () => {
    describe("previewSessionUpdated", () => {
      it("should return async iterator for preview session updates", () => {
        const mockAsyncIterator = jest.fn();
        mockContext.pubsub.asyncIterator = jest
          .fn()
          .mockReturnValue(mockAsyncIterator);

        const result =
          previewResolvers.Subscription.previewSessionUpdated.subscribe(
            {},
            { projectId: "project-1" },
            mockContext,
          );

        expect(result).toBe(mockAsyncIterator);
        expect(mockContext.pubsub.asyncIterator).toHaveBeenCalledWith([
          "PREVIEW_SESSION_UPDATED",
        ]);
      });
    });

    describe("dmxOutputChanged", () => {
      it("should return async iterator for DMX output changes", () => {
        const mockAsyncIterator = jest.fn();
        mockContext.pubsub.asyncIterator = jest
          .fn()
          .mockReturnValue(mockAsyncIterator);

        const result = previewResolvers.Subscription.dmxOutputChanged.subscribe(
          {},
          { universe: 1 },
          mockContext,
        );

        expect(result).toBe(mockAsyncIterator);
        expect(mockContext.pubsub.asyncIterator).toHaveBeenCalledWith([
          "DMX_OUTPUT_CHANGED",
        ]);
      });

      it("should work without universe parameter", () => {
        const mockAsyncIterator = jest.fn();
        mockContext.pubsub.asyncIterator = jest
          .fn()
          .mockReturnValue(mockAsyncIterator);

        const result = previewResolvers.Subscription.dmxOutputChanged.subscribe(
          {},
          {},
          mockContext,
        );

        expect(result).toBe(mockAsyncIterator);
        expect(mockContext.pubsub.asyncIterator).toHaveBeenCalledWith([
          "DMX_OUTPUT_CHANGED",
        ]);
      });
    });
  });

  describe("getDMXOutput helper", () => {
    it("should generate DMX output from channel overrides", async () => {
      const mockSession = {
        id: "session-1",
        projectId: "project-1",
        isActive: true,
        createdAt: new Date(),
        channelOverrides: new Map([
          ["1:5", 255], // Universe 1, Channel 5
          ["1:10", 128], // Universe 1, Channel 10
          ["2:1", 100], // Universe 2, Channel 1
        ]),
      };

      (previewService.getPreviewSession as jest.Mock).mockResolvedValue(
        mockSession,
      );
      mockContext.prisma.project.findUnique = jest.fn().mockResolvedValue({
        id: "project-1",
        name: "Test Project",
      });

      const result = await previewResolvers.Query.previewSession(
        {},
        { sessionId: "session-1" },
        mockContext,
      );

      expect(result.dmxOutput).toHaveLength(2); // Two universes used

      // Check universe 1 output
      const universe1 = result.dmxOutput.find((u: any) => u.universe === 1);
      expect(universe1).toBeDefined();
      expect(universe1!.channels[4]).toBe(255); // Channel 5 (0-indexed as 4)
      expect(universe1!.channels[9]).toBe(128); // Channel 10 (0-indexed as 9)
      expect(universe1!.channels[0]).toBe(0); // Unused channel should be 0

      // Check universe 2 output
      const universe2 = result.dmxOutput.find((u: any) => u.universe === 2);
      expect(universe2).toBeDefined();
      expect(universe2!.channels[0]).toBe(100); // Channel 1 (0-indexed as 0)
      expect(universe2!.channels[1]).toBe(0); // Unused channel should be 0
    });

    it("should return empty array when session not found in helper", async () => {
      const mockSession = {
        id: "session-1",
        projectId: "project-1",
        isActive: true,
        createdAt: new Date(),
        channelOverrides: new Map(),
      };

      // First call returns the session, second call (in getDMXOutput helper) returns null
      (previewService.getPreviewSession as jest.Mock)
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(null);

      mockContext.prisma.project.findUnique = jest.fn().mockResolvedValue({
        id: "project-1",
        name: "Test Project",
      });

      const result = await previewResolvers.Query.previewSession(
        {},
        { sessionId: "session-1" },
        mockContext,
      );

      expect(result.dmxOutput).toEqual([]);
    });
  });
});
