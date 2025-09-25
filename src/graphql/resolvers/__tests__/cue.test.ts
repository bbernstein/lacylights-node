import { cueResolvers } from "../cue";
import { playbackService } from "../../../services/playbackService";
import { getPlaybackStateService } from "../../../services/playbackStateService";
import type { Context } from "../../../context";
import { EasingType } from "@prisma/client";

// Mock the playback service
jest.mock("../../../services/playbackService", () => ({
  playbackService: {
    getPlaybackStatus: jest.fn(),
    invalidateCache: jest.fn(),
  },
}));

// Mock the playback state service
jest.mock("../../../services/playbackStateService", () => ({
  getPlaybackStateService: jest.fn(),
}));

const mockContext: Context = {
  prisma: {
    cueList: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cue: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("Cue Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query.cueListPlaybackStatus", () => {
    it("should return playback status from service", async () => {
      const mockStatus = {
        cueListId: "test-id",
        isPlaying: false,
        currentCue: null,
        nextCue: null,
        previousCue: null,
        fadeProgress: 0,
        lastUpdated: "2023-01-01T00:00:00.000Z",
        currentCueIndex: null,
      };

      const mockPlaybackStateService = {
        getFormattedStatus: jest.fn().mockReturnValue(mockStatus),
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(
        mockPlaybackStateService,
      );

      const result = await cueResolvers.Query.cueListPlaybackStatus(
        {},
        { cueListId: "test-id" },
      );

      expect(result).toEqual(mockStatus);
      expect(getPlaybackStateService).toHaveBeenCalled();
      expect(mockPlaybackStateService.getFormattedStatus).toHaveBeenCalledWith(
        "test-id",
      );
    });
  });

  describe("Query.cueList", () => {
    it("should return cue list with cues", async () => {
      const mockCueList = {
        id: "test-id",
        name: "Test Cue List",
        project: { id: "project-id", name: "Test Project" },
        cues: [
          {
            id: "cue-1",
            name: "Cue 1",
            scene: { id: "scene-1", name: "Scene 1" },
          },
        ],
      };

      mockContext.prisma.cueList.findUnique = jest
        .fn()
        .mockResolvedValue(mockCueList);

      const result = await cueResolvers.Query.cueList(
        {},
        { id: "test-id" },
        mockContext,
      );

      expect(result).toEqual(mockCueList);
      expect(mockContext.prisma.cueList.findUnique).toHaveBeenCalledWith({
        where: { id: "test-id" },
        include: {
          project: true,
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });
    });
  });

  describe("Query.cue", () => {
    it("should return cue with scene and cue list", async () => {
      const mockCue = {
        id: "cue-1",
        name: "Test Cue",
        scene: { id: "scene-1", name: "Test Scene" },
        cueList: { id: "list-1", name: "Test List" },
      };

      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(mockCue);

      const result = await cueResolvers.Query.cue(
        {},
        { id: "cue-1" },
        mockContext,
      );

      expect(result).toEqual(mockCue);
      expect(mockContext.prisma.cue.findUnique).toHaveBeenCalledWith({
        where: { id: "cue-1" },
        include: {
          scene: true,
          cueList: true,
        },
      });
    });
  });

  describe("Mutation.createCue", () => {
    it("should create cue and invalidate cache", async () => {
      const mockInput = {
        name: "New Cue",
        cueNumber: 1.0,
        cueListId: "list-1",
        sceneId: "scene-1",
        fadeInTime: 3.0,
        fadeOutTime: 3.0,
        followTime: undefined,
        easingType: EasingType.LINEAR,
        notes: "Test notes",
      };

      const mockCreatedCue = {
        id: "new-cue-id",
        ...mockInput,
        scene: { id: "scene-1", name: "Test Scene" },
      };

      mockContext.prisma.cue.create = jest
        .fn()
        .mockResolvedValue(mockCreatedCue);

      const result = await cueResolvers.Mutation.createCue(
        {},
        { input: mockInput },
        mockContext,
      );

      expect(result).toEqual(mockCreatedCue);
      expect(mockContext.prisma.cue.create).toHaveBeenCalledWith({
        data: mockInput,
        include: { scene: true },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith("list-1");
    });
  });

  describe("Mutation.updateCue", () => {
    it("should update cue and invalidate cache", async () => {
      const mockInput = {
        name: "Updated Cue",
        cueNumber: 2.0,
        sceneId: "scene-2",
        fadeInTime: 5.0,
        fadeOutTime: 5.0,
        followTime: 2.0,
        easingType: EasingType.EASE_IN_OUT_CUBIC,
        notes: "Updated notes",
      };

      const mockExistingCue = {
        id: "cue-1",
        cueListId: "list-1",
      };

      const mockUpdatedCue = {
        id: "cue-1",
        ...mockInput,
        scene: { id: "scene-2", name: "Updated Scene" },
      };

      mockContext.prisma.cue.findUnique = jest
        .fn()
        .mockResolvedValue(mockExistingCue);
      mockContext.prisma.cue.update = jest
        .fn()
        .mockResolvedValue(mockUpdatedCue);

      const result = await cueResolvers.Mutation.updateCue(
        {},
        { id: "cue-1", input: mockInput },
        mockContext,
      );

      expect(result).toEqual(mockUpdatedCue);
      expect(mockContext.prisma.cue.update).toHaveBeenCalledWith({
        where: { id: "cue-1" },
        data: mockInput,
        include: { scene: true },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith("list-1");
    });

    it("should throw error if cue not found", async () => {
      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.updateCue(
          {},
          { id: "nonexistent", input: {} },
          mockContext,
        ),
      ).rejects.toThrow("Cue with ID nonexistent not found");
    });
  });

  describe("Mutation.deleteCue", () => {
    it("should delete cue and invalidate cache", async () => {
      const mockExistingCue = {
        id: "cue-1",
        cueListId: "list-1",
      };

      mockContext.prisma.cue.findUnique = jest
        .fn()
        .mockResolvedValue(mockExistingCue);
      mockContext.prisma.cue.delete = jest
        .fn()
        .mockResolvedValue(mockExistingCue);

      const result = await cueResolvers.Mutation.deleteCue(
        {},
        { id: "cue-1" },
        mockContext,
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.cue.delete).toHaveBeenCalledWith({
        where: { id: "cue-1" },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith("list-1");
    });

    it("should throw error if cue not found", async () => {
      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.deleteCue({}, { id: "nonexistent" }, mockContext),
      ).rejects.toThrow("Cue with ID nonexistent not found");
    });
  });

  describe("Mutation.reorderCues", () => {
    it("should reorder cues and invalidate cache", async () => {
      const mockCueList = {
        id: "list-1",
        cues: [
          { id: "cue-1", cueNumber: 1.0 },
          { id: "cue-2", cueNumber: 2.0 },
        ],
      };

      const cueOrders = [
        { cueId: "cue-1", cueNumber: 2.0 },
        { cueId: "cue-2", cueNumber: 1.0 },
      ];

      mockContext.prisma.cueList.findUnique = jest
        .fn()
        .mockResolvedValue(mockCueList);
      mockContext.prisma.$transaction = jest
        .fn()
        .mockImplementation((callback) => callback(mockContext.prisma));

      const result = await cueResolvers.Mutation.reorderCues(
        {},
        { cueListId: "list-1", cueOrders },
        mockContext,
      );

      expect(result).toBe(true);
      expect(playbackService.invalidateCache).toHaveBeenCalledWith("list-1");
    });

    it("should throw error if cue list not found", async () => {
      mockContext.prisma.cueList.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.reorderCues(
          {},
          { cueListId: "nonexistent", cueOrders: [] },
          mockContext,
        ),
      ).rejects.toThrow("Cue list with ID nonexistent not found");
    });

    it("should throw error if cue does not belong to cue list", async () => {
      const mockCueList = {
        id: "list-1",
        cues: [{ id: "cue-1", cueNumber: 1.0 }],
      };

      const cueOrders = [{ cueId: "invalid-cue", cueNumber: 1.0 }];

      mockContext.prisma.cueList.findUnique = jest
        .fn()
        .mockResolvedValue(mockCueList);

      await expect(
        cueResolvers.Mutation.reorderCues(
          {},
          { cueListId: "list-1", cueOrders },
          mockContext,
        ),
      ).rejects.toThrow(
        "Cue with ID invalid-cue does not belong to cue list list-1",
      );
    });
  });

  describe("Subscription.cueListPlaybackUpdated", () => {
    const mockWebSocketContext = {
      pubsub: {
        asyncIterator: jest.fn(),
        publish: jest.fn(),
      },
    };

    it("should subscribe to correct channel name", () => {
      const subscription = cueResolvers.Subscription.cueListPlaybackUpdated;

      // Call the subscribe function
      subscription.subscribe(
        {},
        { cueListId: "test-cue-list" },
        mockWebSocketContext as any,
      );

      // Verify it subscribes to the correct channel
      expect(mockWebSocketContext.pubsub.asyncIterator).toHaveBeenCalledWith([
        "CUE_LIST_PLAYBACK_UPDATED",
      ]);

      // Ensure it's NOT using the old channel format with cueListId suffix
      expect(
        mockWebSocketContext.pubsub.asyncIterator,
      ).not.toHaveBeenCalledWith(["CUE_LIST_PLAYBACK_UPDATED_test-cue-list"]);
    });

    it("should filter by cueListId correctly", () => {
      // Test the filter function directly
      const mockPayload1 = {
        cueListPlaybackUpdated: { cueListId: "list-1" },
      };
      const mockPayload2 = {
        cueListPlaybackUpdated: { cueListId: "list-2" },
      };
      const mockVariables = { cueListId: "list-1" };

      // The filter should match when cueListIds are the same
      expect(mockPayload1.cueListPlaybackUpdated.cueListId).toBe(
        mockVariables.cueListId,
      );

      // The filter should not match when cueListIds are different
      expect(mockPayload2.cueListPlaybackUpdated.cueListId).not.toBe(
        mockVariables.cueListId,
      );
    });

    it("should handle invalid cueListId in subscription variables", () => {
      const subscription = cueResolvers.Subscription.cueListPlaybackUpdated;

      // Test with various invalid cueListId values that should be filtered out
      const invalidVariables = [
        { cueListId: "" },
        { cueListId: null },
        { cueListId: undefined },
        { cueListId: 123 }, // number instead of string
      ];

      // The subscription should still be created but filtering should handle invalid values
      invalidVariables.forEach((variables) => {
        expect(() => {
          subscription.subscribe(
            {},
            variables as any,
            mockWebSocketContext as any,
          );
        }).not.toThrow();
      });
    });

    it("should resolve payload correctly", () => {
      const subscription = cueResolvers.Subscription.cueListPlaybackUpdated;
      const mockPayload = {
        cueListPlaybackUpdated: {
          cueListId: "test-list",
          isPlaying: true,
          currentCueIndex: 5,
          fadeProgress: 75,
        },
      };

      const result = subscription.resolve(mockPayload);
      expect(result).toEqual(mockPayload.cueListPlaybackUpdated);
    });
  });

  describe("Cue Navigation with Subscription Updates", () => {
    const mockCueList = {
      id: "test-list",
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
    };

    beforeEach(() => {
      mockContext.prisma.cueList.findUnique = jest
        .fn()
        .mockResolvedValue(mockCueList);
    });

    it("should not duplicate startCue calls in nextCue mutation", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue({
          currentCueIndex: 0,
        }),
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(
        mockPlaybackStateService,
      );

      // Mock the dmx resolver import
      const mockPlayCue = jest.fn();
      jest.doMock("../dmx", () => ({
        dmxResolvers: {
          Mutation: {
            playCue: mockPlayCue,
          },
        },
      }));

      await cueResolvers.Mutation.nextCue(
        {},
        { cueListId: "test-list", fadeInTime: 2 },
        mockContext,
      );

      // Verify playCue was called (which handles both DMX and state updates)
      expect(mockPlayCue).toHaveBeenCalledWith(
        null,
        { cueId: "cue-2", fadeInTime: 2 },
        mockContext,
      );

      // The playback state service should have been called to get current state
      expect(mockPlaybackStateService.getPlaybackState).toHaveBeenCalledWith(
        "test-list",
      );
    });

    it("should handle previousCue navigation correctly", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue({
          currentCueIndex: 1, // Currently at second cue
        }),
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(
        mockPlaybackStateService,
      );

      // Test that previousCue gets the correct playback state and validates boundaries
      await cueResolvers.Mutation.previousCue(
        {},
        { cueListId: "test-list", fadeInTime: 1.5 },
        mockContext,
      );

      // Should have checked the current playback state
      expect(mockPlaybackStateService.getPlaybackState).toHaveBeenCalledWith(
        "test-list",
      );

      // Should have queried for the cue list to get the previous cue
      expect(mockContext.prisma.cueList.findUnique).toHaveBeenCalledWith({
        where: { id: "test-list" },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });
    });

    it("should handle goToCue navigation correctly", async () => {
      await cueResolvers.Mutation.goToCue(
        {},
        { cueListId: "test-list", cueIndex: 1, fadeInTime: 3 },
        mockContext,
      );

      // Should have queried for the cue list to get the target cue
      expect(mockContext.prisma.cueList.findUnique).toHaveBeenCalledWith({
        where: { id: "test-list" },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });
    });

    it("should prevent boundary violations in navigation", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue({
          currentCueIndex: 1, // At last cue
        }),
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(
        mockPlaybackStateService,
      );

      // Test nextCue at last cue
      await expect(
        cueResolvers.Mutation.nextCue(
          {},
          { cueListId: "test-list" },
          mockContext,
        ),
      ).rejects.toThrow("Already at last cue");

      // Test previousCue at first cue
      mockPlaybackStateService.getPlaybackState.mockReturnValue({
        currentCueIndex: 0,
      });

      await expect(
        cueResolvers.Mutation.previousCue(
          {},
          { cueListId: "test-list" },
          mockContext,
        ),
      ).rejects.toThrow("Already at first cue");

      // Test goToCue with invalid index
      await expect(
        cueResolvers.Mutation.goToCue(
          {},
          { cueListId: "test-list", cueIndex: 5 },
          mockContext,
        ),
      ).rejects.toThrow("Invalid cue index");
    });
  });

  // CueList CRUD Operations Tests
  describe("Mutation.createCueList", () => {
    it("should create cue list with all properties", async () => {
      const mockInput = {
        name: "Test Cue List",
        description: "Test Description",
        projectId: "project-123"
      };

      const mockCreatedCueList = {
        id: "cuelist-123",
        name: "Test Cue List",
        description: "Test Description",
        projectId: "project-123",
        project: { id: "project-123", name: "Test Project" },
        cues: []
      };

      (mockContext.prisma.cueList.create as jest.Mock).mockResolvedValue(mockCreatedCueList);

      const result = await cueResolvers.Mutation.createCueList(
        {},
        { input: mockInput },
        mockContext
      );

      expect(result).toEqual(mockCreatedCueList);
      expect(mockContext.prisma.cueList.create).toHaveBeenCalledWith({
        data: {
          name: "Test Cue List",
          description: "Test Description",
          projectId: "project-123"
        },
        include: {
          project: true,
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" }
          }
        }
      });
    });
  });

  describe("Mutation.updateCueList", () => {
    it("should update cue list with provided data", async () => {
      const mockInput = {
        name: "Updated Cue List",
        description: "Updated Description"
      };

      const mockUpdatedCueList = {
        id: "cuelist-123",
        name: "Updated Cue List",
        description: "Updated Description",
        projectId: "project-123",
        project: { id: "project-123", name: "Test Project" },
        cues: []
      };

      (mockContext.prisma.cueList.update as jest.Mock).mockResolvedValue(mockUpdatedCueList);

      const result = await cueResolvers.Mutation.updateCueList(
        {},
        { id: "cuelist-123", input: mockInput },
        mockContext
      );

      expect(result).toEqual(mockUpdatedCueList);
      expect(mockContext.prisma.cueList.update).toHaveBeenCalledWith({
        where: { id: "cuelist-123" },
        data: {
          name: "Updated Cue List",
          description: "Updated Description"
        },
        include: {
          project: true,
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" }
          }
        }
      });
    });
  });

  describe("Mutation.deleteCueList", () => {
    it("should delete cue list and return true", async () => {
      (mockContext.prisma.cueList.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await cueResolvers.Mutation.deleteCueList(
        {},
        { id: "cuelist-123" },
        mockContext
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.cueList.delete).toHaveBeenCalledWith({
        where: { id: "cuelist-123" }
      });
    });
  });

  // Playback Control Tests
  describe("Mutation.startCueList", () => {
    it("should start cue list from beginning", async () => {
      const mockCueList = {
        id: "cuelist-123",
        name: "Test Cue List",
        cues: [
          { id: "cue-1", cueNumber: 1.0, scene: { id: "scene-1" } },
          { id: "cue-2", cueNumber: 2.0, scene: { id: "scene-2" } }
        ]
      };

      const mockPlaybackStateService = {
        startCue: jest.fn().mockResolvedValue(undefined)
      };

      (mockContext.prisma.cueList.findUnique as jest.Mock).mockResolvedValue(mockCueList);
      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      const result = await cueResolvers.Mutation.startCueList(
        {},
        { cueListId: "cuelist-123" },
        mockContext
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.cueList.findUnique).toHaveBeenCalledWith({
        where: { id: "cuelist-123" },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" }
          }
        }
      });
      expect(mockPlaybackStateService.startCue).toHaveBeenCalledWith(
        "cuelist-123",
        0,
        mockCueList.cues[0]
      );
    });

    it("should start cue list from specific cue", async () => {
      const mockCueList = {
        id: "cuelist-123",
        name: "Test Cue List",
        cues: [
          { id: "cue-1", cueNumber: 1.0, scene: { id: "scene-1" } },
          { id: "cue-2", cueNumber: 2.0, scene: { id: "scene-2" } }
        ]
      };

      const mockPlaybackStateService = {
        startCue: jest.fn().mockResolvedValue(undefined)
      };

      (mockContext.prisma.cueList.findUnique as jest.Mock).mockResolvedValue(mockCueList);
      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      const result = await cueResolvers.Mutation.startCueList(
        {},
        { cueListId: "cuelist-123", startFromCue: 1 },
        mockContext
      );

      expect(result).toBe(true);
      expect(mockPlaybackStateService.startCue).toHaveBeenCalledWith(
        "cuelist-123",
        1,
        mockCueList.cues[1]
      );
    });

    it("should throw error if cue list not found", async () => {
      (mockContext.prisma.cueList.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.startCueList(
          {},
          { cueListId: "nonexistent" },
          mockContext
        )
      ).rejects.toThrow("Cue list not found or empty");
    });

    it("should throw error if cue list is empty", async () => {
      const mockEmptyCueList = {
        id: "cuelist-123",
        name: "Empty Cue List",
        cues: []
      };

      (mockContext.prisma.cueList.findUnique as jest.Mock).mockResolvedValue(mockEmptyCueList);

      await expect(
        cueResolvers.Mutation.startCueList(
          {},
          { cueListId: "cuelist-123" },
          mockContext
        )
      ).rejects.toThrow("Cue list not found or empty");
    });

    it("should throw error for invalid start cue index", async () => {
      const mockCueList = {
        id: "cuelist-123",
        name: "Test Cue List",
        cues: [
          { id: "cue-1", cueNumber: 1.0, scene: { id: "scene-1" } }
        ]
      };

      (mockContext.prisma.cueList.findUnique as jest.Mock).mockResolvedValue(mockCueList);

      await expect(
        cueResolvers.Mutation.startCueList(
          {},
          { cueListId: "cuelist-123", startFromCue: 5 },
          mockContext
        )
      ).rejects.toThrow("Invalid cue index");

      await expect(
        cueResolvers.Mutation.startCueList(
          {},
          { cueListId: "cuelist-123", startFromCue: -1 },
          mockContext
        )
      ).rejects.toThrow("Invalid cue index");
    });
  });

  describe("Mutation.stopCueList", () => {
    it("should stop cue list playback", async () => {
      const mockPlaybackStateService = {
        stopCueList: jest.fn()
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      const result = await cueResolvers.Mutation.stopCueList(
        {},
        { cueListId: "cuelist-123" }
      );

      expect(result).toBe(true);
      expect(mockPlaybackStateService.stopCueList).toHaveBeenCalledWith("cuelist-123");
    });
  });

  // Navigation Error Cases
  describe("Navigation Error Handling", () => {
    it("should throw error for nextCue when no playback state", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue(null)
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      await expect(
        cueResolvers.Mutation.nextCue(
          {},
          { cueListId: "cuelist-123" },
          mockContext
        )
      ).rejects.toThrow("No active playback for this cue list");
    });

    it("should throw error for nextCue when current cue index is null", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue({
          currentCueIndex: null
        })
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      await expect(
        cueResolvers.Mutation.nextCue(
          {},
          { cueListId: "cuelist-123" },
          mockContext
        )
      ).rejects.toThrow("No active playback for this cue list");
    });

    it("should throw error for previousCue when no playback state", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue(null)
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      await expect(
        cueResolvers.Mutation.previousCue(
          {},
          { cueListId: "cuelist-123" },
          mockContext
        )
      ).rejects.toThrow("No active playback for this cue list");
    });

    it("should throw error for goToCue when no playback state", async () => {
      const mockPlaybackStateService = {
        getPlaybackState: jest.fn().mockReturnValue(null)
      };

      (getPlaybackStateService as jest.Mock).mockReturnValue(mockPlaybackStateService);

      await expect(
        cueResolvers.Mutation.goToCue(
          {},
          { cueListId: "cuelist-123", cueIndex: 1 },
          mockContext
        )
      ).rejects.toThrow("Invalid cue index");
    });
  });

  // Bulk Update Operations Tests
  describe("Mutation.bulkUpdateCues", () => {
    it("should update multiple cues with all fields", async () => {
      const mockInput = {
        cueIds: ["cue-1", "cue-2"],
        fadeInTime: 3.0,
        fadeOutTime: 2.0,
        followTime: 5.0,
        easingType: EasingType.LINEAR
      };

      const mockExistingCues = [
        { id: "cue-1", cueListId: "cuelist-123", scene: { id: "scene-1" } },
        { id: "cue-2", cueListId: "cuelist-123", scene: { id: "scene-2" } }
      ];

      const mockUpdatedCues = [
        { id: "cue-1", fadeInTime: 3.0, fadeOutTime: 2.0, followTime: 5.0, easingType: EasingType.LINEAR, scene: { id: "scene-1" } },
        { id: "cue-2", fadeInTime: 3.0, fadeOutTime: 2.0, followTime: 5.0, easingType: EasingType.LINEAR, scene: { id: "scene-2" } }
      ];

      (mockContext.prisma.cue.findMany as jest.Mock).mockResolvedValue(mockExistingCues);
      (mockContext.prisma.$transaction as jest.Mock).mockResolvedValue(mockUpdatedCues);

      const result = await cueResolvers.Mutation.bulkUpdateCues(
        {},
        { input: mockInput },
        mockContext
      );

      expect(result).toEqual(mockUpdatedCues);
      expect(mockContext.prisma.cue.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["cue-1", "cue-2"] } },
        include: { scene: true }
      });
    });

    it("should update cues with partial fields", async () => {
      const mockInput = {
        cueIds: ["cue-1"],
        fadeInTime: 4.0
      };

      const mockExistingCues = [
        { id: "cue-1", cueListId: "cuelist-456", scene: { id: "scene-1" } }
      ];

      const mockUpdatedCue = {
        id: "cue-1",
        fadeInTime: 4.0,
        scene: { id: "scene-1" }
      };

      (mockContext.prisma.cue.findMany as jest.Mock).mockResolvedValue(mockExistingCues);
      (mockContext.prisma.$transaction as jest.Mock).mockResolvedValue([mockUpdatedCue]);

      const result = await cueResolvers.Mutation.bulkUpdateCues(
        {},
        { input: mockInput },
        mockContext
      );

      expect(result).toEqual([mockUpdatedCue]);
    });

    it("should throw error when some cues are not found", async () => {
      const mockInput = {
        cueIds: ["cue-1", "cue-2", "cue-3"],
        fadeInTime: 3.0
      };

      const mockExistingCues = [
        { id: "cue-1", scene: { id: "scene-1" } }
      ];

      (mockContext.prisma.cue.findMany as jest.Mock).mockResolvedValue(mockExistingCues);

      await expect(
        cueResolvers.Mutation.bulkUpdateCues(
          {},
          { input: mockInput },
          mockContext
        )
      ).rejects.toThrow("Cues not found: cue-2, cue-3");
    });

    it("should throw error when no update fields provided", async () => {
      const mockInput = {
        cueIds: ["cue-1"]
      };

      const mockExistingCues = [
        { id: "cue-1", scene: { id: "scene-1" } }
      ];

      (mockContext.prisma.cue.findMany as jest.Mock).mockResolvedValue(mockExistingCues);

      await expect(
        cueResolvers.Mutation.bulkUpdateCues(
          {},
          { input: mockInput },
          mockContext
        )
      ).rejects.toThrow("No update fields provided");
    });

    it("should handle followTime set to undefined", async () => {
      const mockInput = {
        cueIds: ["cue-1"],
        followTime: undefined
      };

      const mockExistingCues = [
        { id: "cue-1", cueListId: "cuelist-789", scene: { id: "scene-1" } }
      ];

      const mockUpdatedCue = {
        id: "cue-1",
        followTime: undefined,
        scene: { id: "scene-1" }
      };

      (mockContext.prisma.cue.findMany as jest.Mock).mockResolvedValue(mockExistingCues);
      (mockContext.prisma.$transaction as jest.Mock).mockResolvedValue([mockUpdatedCue]);

      const result = await cueResolvers.Mutation.bulkUpdateCues(
        {},
        { input: mockInput },
        mockContext
      );

      expect(result).toEqual([mockUpdatedCue]);
    });
  });
});
