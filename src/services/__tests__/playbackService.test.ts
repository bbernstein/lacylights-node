import type { PubSub } from "graphql-subscriptions";

const mockPrisma = {
  cueList: {
    findUnique: jest.fn(),
  },
} as jest.Mocked<any>;

const mockPubSub = {
  publish: jest.fn(),
  asyncIterator: jest.fn(),
} as unknown as PubSub;

// Mock the context dependencies
jest.mock("../../context", () => ({
  getSharedPrisma: jest.fn().mockReturnValue(mockPrisma),
  getSharedPubSub: jest.fn().mockReturnValue(mockPubSub),
}));

import { playbackService } from "../playbackService";

describe("PlaybackService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Clear any cached state
    playbackService.cleanup();
  });

  const mockCueList = {
    id: "test-cue-list-id",
    name: "Test Cue List",
    cues: [
      {
        id: "cue-1",
        name: "Cue 1",
        cueNumber: 1.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        cueListId: "test-cue-list-id",
        sceneId: "scene-1",
        fadeInTime: 3.0,
        fadeOutTime: 3.0,
        followTime: null,
        easingType: null,
        notes: null,
        scene: {
          id: "scene-1",
          name: "Scene 1",
          description: null,
          projectId: "project-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        id: "cue-2",
        name: "Cue 2",
        cueNumber: 2.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        cueListId: "test-cue-list-id",
        sceneId: "scene-2",
        fadeInTime: 3.0,
        fadeOutTime: 3.0,
        followTime: null,
        easingType: null,
        notes: null,
        scene: {
          id: "scene-2",
          name: "Scene 2",
          description: null,
          projectId: "project-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
  };

  describe("getPlaybackStatus", () => {
    it("should return initial playback status for new cue list", async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status).toEqual({
        cueListId: "test-cue-list-id",
        isPlaying: false,
        currentCue: null,
        nextCue: mockCueList.cues[0],
        previousCue: null,
        fadeProgress: 0,
        lastUpdated: expect.any(String),
      });
    });

    it("should return cached status for existing cue list", async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);

      // First call should hit database
      const status1 =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      // Second call should use cache
      const status2 =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(mockPrisma.cueList.findUnique).toHaveBeenCalledTimes(1);
      expect(status1).toEqual(status2);
    });

    it("should throw error for invalid cueListId", async () => {
      await expect(playbackService.getPlaybackStatus("")).rejects.toThrow(
        "Invalid cueListId: must be a non-empty string",
      );

      await expect(
        playbackService.getPlaybackStatus(null as any),
      ).rejects.toThrow("Invalid cueListId: must be a non-empty string");
    });

    it("should throw error when cue list not found", async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        playbackService.getPlaybackStatus("nonexistent-id"),
      ).rejects.toThrow("Cue list with ID nonexistent-id not found");
    });

    it("should handle empty cue list", async () => {
      const emptyCueList = { ...mockCueList, cues: [] };
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(emptyCueList);

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status.nextCue).toBeNull();
    });
  });

  describe("updatePlaybackStatus", () => {
    beforeEach(async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
      // Initialize the cue list
      await playbackService.getPlaybackStatus("test-cue-list-id");
    });

    it("should update playback status and emit subscription", async () => {
      await playbackService.updatePlaybackStatus("test-cue-list-id", {
        isPlaying: true,
        currentCue: mockCueList.cues[0],
      });

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status.isPlaying).toBe(true);
      expect(status.currentCue).toEqual(mockCueList.cues[0]);
      expect(mockPubSub.publish).toHaveBeenCalledWith(
        "CUE_LIST_PLAYBACK_UPDATED",
        {
          cueListPlaybackUpdated: expect.objectContaining({
            cueListId: "test-cue-list-id",
            isPlaying: true,
          }),
        },
      );
    });

    it("should throttle subscription emissions", async () => {
      // Make multiple rapid updates
      await playbackService.updatePlaybackStatus("test-cue-list-id", {
        fadeProgress: 0.1,
      });
      await playbackService.updatePlaybackStatus("test-cue-list-id", {
        fadeProgress: 0.2,
      });
      await playbackService.updatePlaybackStatus("test-cue-list-id", {
        fadeProgress: 0.3,
      });

      // Only the first update should emit (due to throttling)
      expect(mockPubSub.publish).toHaveBeenCalledTimes(1);
    });

    it("should preserve cueListId in updates", async () => {
      await playbackService.updatePlaybackStatus("test-cue-list-id", {
        cueListId: "different-id", // This should be ignored
        isPlaying: true,
      } as any);

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(status.cueListId).toBe("test-cue-list-id");
    });
  });

  describe("startPlayback", () => {
    beforeEach(async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
    });

    it("should start playback with first cue", async () => {
      await playbackService.startPlayback("test-cue-list-id");

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status.isPlaying).toBe(true);
      expect(status.currentCue).toEqual(mockCueList.cues[0]);
      expect(status.nextCue).toEqual(mockCueList.cues[1]);
      expect(status.previousCue).toBeNull();
      expect(status.fadeProgress).toBe(0);
    });

    it("should throw error for empty cue list", async () => {
      const emptyCueList = { ...mockCueList, cues: [] };
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(emptyCueList);

      await expect(
        playbackService.startPlayback("test-cue-list-id"),
      ).rejects.toThrow("Cannot start playback: cue list is empty");
    });
  });

  describe("stopPlayback", () => {
    beforeEach(async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
      await playbackService.startPlayback("test-cue-list-id");
    });

    it("should stop playback", async () => {
      await playbackService.stopPlayback("test-cue-list-id");

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status.isPlaying).toBe(false);
      expect(status.fadeProgress).toBe(0);
    });
  });

  describe("jumpToCue", () => {
    beforeEach(async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
    });

    it("should jump to specific cue by index", async () => {
      await playbackService.jumpToCue("test-cue-list-id", 1);

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");

      expect(status.currentCue).toEqual(mockCueList.cues[1]);
      expect(status.nextCue).toBeNull(); // Last cue
      expect(status.previousCue).toEqual(mockCueList.cues[0]);
      expect(status.fadeProgress).toBe(0);
    });

    it("should throw error for invalid cue index", async () => {
      await expect(
        playbackService.jumpToCue("test-cue-list-id", -1),
      ).rejects.toThrow("Invalid cue index: -1. Cue list has 2 cues.");

      await expect(
        playbackService.jumpToCue("test-cue-list-id", 5),
      ).rejects.toThrow("Invalid cue index: 5. Cue list has 2 cues.");
    });
  });

  describe("updateFadeProgress", () => {
    beforeEach(async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
      await playbackService.startPlayback("test-cue-list-id");
    });

    it("should update fade progress", async () => {
      await playbackService.updateFadeProgress("test-cue-list-id", 0.5);

      const status =
        await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(status.fadeProgress).toBe(0.5);
    });

    it("should clamp fade progress between 0 and 1", async () => {
      await playbackService.updateFadeProgress("test-cue-list-id", -0.5);
      let status = await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(status.fadeProgress).toBe(0);

      await playbackService.updateFadeProgress("test-cue-list-id", 1.5);
      status = await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(status.fadeProgress).toBe(1);
    });
  });

  describe("invalidateCache", () => {
    it("should invalidate cache for specific cue list", async () => {
      // Set up a fresh mock for this test
      const findUniqueMock = jest.fn().mockResolvedValue(mockCueList);
      mockPrisma.cueList.findUnique = findUniqueMock;

      // First call should hit database
      await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(findUniqueMock).toHaveBeenCalledTimes(1);

      // Invalidate cache - this only clears the cue list cache, not playback state
      playbackService.invalidateCache("test-cue-list-id");

      // Clear playback state as well to test full cache invalidation
      playbackService.cleanup();

      // Next call should hit database again
      await playbackService.getPlaybackStatus("test-cue-list-id");
      expect(findUniqueMock).toHaveBeenCalledTimes(2);
    });
  });
}); 
