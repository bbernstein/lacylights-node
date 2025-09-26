import { PubSub } from "graphql-subscriptions";
import { PreviewService, getPreviewService, previewService } from "../previewService";
import { dmxService } from "../dmx";

// Mock dependencies
jest.mock("@prisma/client");
jest.mock("graphql-subscriptions");
jest.mock("../dmx");

const mockPrisma = {
  fixtureInstance: {
    findUnique: jest.fn(),
  },
  scene: {
    findUnique: jest.fn(),
  },
} as any;

const mockPubSub = {
  publish: jest.fn(),
} as unknown as jest.Mocked<PubSub>;

const mockDmxService = dmxService as jest.Mocked<typeof dmxService>;

// Mock console.error
const originalConsoleError = console.error;
const mockConsoleError = jest.fn();

describe("PreviewService", () => {
  let service: PreviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    console.error = mockConsoleError;

    // Create fresh service instance
    service = new PreviewService(mockPrisma, mockPubSub);

    // Mock DMX service methods
    mockDmxService.getUniverseChannels.mockReturnValue(new Array(512).fill(0));
    mockDmxService.setChannelOverride.mockImplementation(() => {});
    mockDmxService.clearChannelOverride.mockImplementation(() => {});

    // Mock PubSub
    mockPubSub.publish.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    console.error = originalConsoleError;
  });

  describe("startPreviewSession", () => {
    it("should create a new preview session", async () => {
      const session = await service.startPreviewSession("project-1", "user-1");

      expect(session.id).toMatch(/^preview_\d+_[a-z0-9]+$/);
      expect(session.projectId).toBe("project-1");
      expect(session.userId).toBe("user-1");
      expect(session.isActive).toBe(true);
      expect(session.channelOverrides.size).toBe(0);
      expect(session.timeout).toBeDefined();

      expect(mockPubSub.publish).toHaveBeenCalledWith("PREVIEW_SESSION_UPDATED", {
        previewSessionUpdated: {
          id: session.id,
          projectId: "project-1",
          isActive: true,
          createdAt: session.createdAt.toISOString(),
          dmxOutput: [],
        },
      });
    });

    it("should cancel existing sessions for the same project", async () => {
      // Create first session
      const session1 = await service.startPreviewSession("project-1");
      expect(service["sessions"].size).toBe(1);

      // Create second session for same project
      const session2 = await service.startPreviewSession("project-1");

      expect(service["sessions"].size).toBe(1);
      expect(service["sessions"].has(session1.id)).toBe(false);
      expect(service["sessions"].has(session2.id)).toBe(true);
    });

    it("should allow multiple sessions for different projects", async () => {
      const session1 = await service.startPreviewSession("project-1");
      const session2 = await service.startPreviewSession("project-2");

      expect(service["sessions"].size).toBe(2);
      expect(service["sessions"].has(session1.id)).toBe(true);
      expect(service["sessions"].has(session2.id)).toBe(true);
    });

    it("should set up session timeout", async () => {
      const session = await service.startPreviewSession("project-1");

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(30 * 60 * 1000); // 30 minutes

      // Session should be cancelled
      expect(service["sessions"].has(session.id)).toBe(false);
    });
  });

  describe("updateChannelValue", () => {
    let session: any;
    const mockFixture = {
      id: "fixture-1",
      startChannel: 1,
      universe: 1,
      definition: {
        id: "def-1",
        channelCount: 3,
      },
    };

    beforeEach(async () => {
      session = await service.startPreviewSession("project-1");
      mockPrisma.fixtureInstance.findUnique.mockResolvedValue(mockFixture as any);
    });

    it("should update channel value successfully", async () => {
      const result = await service.updateChannelValue(
        session.id,
        "fixture-1",
        0, // First channel
        128
      );

      expect(result).toBe(true);
      expect(session.channelOverrides.get("1:1")).toBe(128);
      expect(mockDmxService.setChannelOverride).toHaveBeenCalledWith(1, 1, 128);
      expect(mockPubSub.publish).toHaveBeenCalledWith("DMX_OUTPUT_CHANGED", {
        dmxOutputChanged: {
          universe: 1,
          channels: expect.any(Array),
        },
      });
    });

    it("should clamp values to 0-255 range", async () => {
      await service.updateChannelValue(session.id, "fixture-1", 0, 300);
      expect(session.channelOverrides.get("1:1")).toBe(255);

      await service.updateChannelValue(session.id, "fixture-1", 0, -10);
      expect(session.channelOverrides.get("1:1")).toBe(0);
    });

    it("should return false for invalid session", async () => {
      const result = await service.updateChannelValue(
        "invalid-session",
        "fixture-1",
        0,
        128
      );

      expect(result).toBe(false);
      expect(mockDmxService.setChannelOverride).not.toHaveBeenCalled();
    });

    it("should return false for inactive session", async () => {
      session.isActive = false;

      const result = await service.updateChannelValue(
        session.id,
        "fixture-1",
        0,
        128
      );

      expect(result).toBe(false);
      expect(mockDmxService.setChannelOverride).not.toHaveBeenCalled();
    });

    it("should return false for nonexistent fixture", async () => {
      mockPrisma.fixtureInstance.findUnique.mockResolvedValue(null);

      const result = await service.updateChannelValue(
        session.id,
        "fixture-1",
        0,
        128
      );

      expect(result).toBe(false);
      expect(mockDmxService.setChannelOverride).not.toHaveBeenCalled();
    });

    it("should refresh session timeout", async () => {
      const originalTimeout = session.timeout;

      await service.updateChannelValue(session.id, "fixture-1", 0, 128);

      expect(session.timeout).not.toBe(originalTimeout);
    });
  });

  describe("initializeWithScene", () => {
    let session: any;
    const mockScene = {
      id: "scene-1",
      fixtureValues: [
        {
          fixture: {
            id: "fixture-1",
            startChannel: 1,
            universe: 1,
          },
          channelValues: [255, 128, 64],
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

    beforeEach(async () => {
      session = await service.startPreviewSession("project-1");
      mockPrisma.scene.findUnique.mockResolvedValue(mockScene as any);
    });

    it("should initialize session with scene data", async () => {
      const result = await service.initializeWithScene(session.id, "scene-1");

      expect(result).toBe(true);
      expect(session.channelOverrides.get("1:1")).toBe(255);
      expect(session.channelOverrides.get("1:2")).toBe(128);
      expect(session.channelOverrides.get("1:3")).toBe(64);
      expect(session.channelOverrides.get("1:10")).toBe(100);
      expect(session.channelOverrides.get("1:11")).toBe(200);

      expect(mockDmxService.setChannelOverride).toHaveBeenCalledTimes(5);
      expect(mockPubSub.publish).toHaveBeenCalledWith("DMX_OUTPUT_CHANGED", {
        dmxOutputChanged: {
          universe: 1,
          channels: expect.any(Array),
        },
      });
    });

    it("should handle null/undefined channel values", async () => {
      const sceneWithNulls = {
        ...mockScene,
        fixtureValues: [
          {
            fixture: {
              id: "fixture-1",
              startChannel: 1,
              universe: 1,
            },
            channelValues: [255, null, undefined, 64],
          },
        ],
      };
      mockPrisma.scene.findUnique.mockResolvedValue(sceneWithNulls as any);

      const result = await service.initializeWithScene(session.id, "scene-1");

      expect(result).toBe(true);
      expect(session.channelOverrides.get("1:1")).toBe(255);
      expect(session.channelOverrides.has("1:2")).toBe(false);
      expect(session.channelOverrides.has("1:3")).toBe(false);
      expect(session.channelOverrides.get("1:4")).toBe(64);
    });

    it("should return false for invalid session", async () => {
      const result = await service.initializeWithScene("invalid-session", "scene-1");
      expect(result).toBe(false);
    });

    it("should return false for nonexistent scene", async () => {
      mockPrisma.scene.findUnique.mockResolvedValue(null);

      const result = await service.initializeWithScene(session.id, "scene-1");
      expect(result).toBe(false);
    });

    it("should handle database errors", async () => {
      mockPrisma.scene.findUnique.mockRejectedValue(new Error("Database error"));

      const result = await service.initializeWithScene(session.id, "scene-1");
      expect(result).toBe(false);
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Error initializing preview with scene:",
        expect.any(Error)
      );
    });
  });

  describe("commitPreviewSession", () => {
    it("should commit and cancel the session", async () => {
      const session = await service.startPreviewSession("project-1");

      const result = await service.commitPreviewSession(session.id);

      expect(result).toBe(true);
      expect(service["sessions"].has(session.id)).toBe(false);
    });

    it("should return false for invalid session", async () => {
      const result = await service.commitPreviewSession("invalid-session");
      expect(result).toBe(false);
    });
  });

  describe("cancelPreviewSession", () => {
    it("should cancel session and clean up resources", async () => {
      const session = await service.startPreviewSession("project-1");

      // Add some channel overrides
      session.channelOverrides.set("1:1", 255);
      session.channelOverrides.set("1:2", 128);

      const result = await service.cancelPreviewSession(session.id);

      expect(result).toBe(true);
      expect(service["sessions"].has(session.id)).toBe(false);
      expect(mockDmxService.clearChannelOverride).toHaveBeenCalledWith(1, 1);
      expect(mockDmxService.clearChannelOverride).toHaveBeenCalledWith(1, 2);
      expect(mockPubSub.publish).toHaveBeenCalledWith("PREVIEW_SESSION_UPDATED", {
        previewSessionUpdated: {
          id: session.id,
          projectId: "project-1",
          isActive: false,
          createdAt: session.createdAt.toISOString(),
          dmxOutput: [],
        },
      });
    });

    it("should return false for nonexistent session", async () => {
      const result = await service.cancelPreviewSession("nonexistent");
      expect(result).toBe(false);
    });

    it("should clear timeout", async () => {
      const session = await service.startPreviewSession("project-1");
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      await service.cancelPreviewSession(session.id);

      expect(clearTimeoutSpy).toHaveBeenCalledWith(session.timeout);
    });
  });

  describe("getPreviewSession", () => {
    it("should return session when it exists", async () => {
      const session = await service.startPreviewSession("project-1");

      const retrieved = await service.getPreviewSession(session.id);

      expect(retrieved).toBe(session);
    });

    it("should return null for nonexistent session", async () => {
      const retrieved = await service.getPreviewSession("nonexistent");
      expect(retrieved).toBe(null);
    });
  });

  describe("getUniverseChannels", () => {
    it("should return channels with preview overrides", async () => {
      const session = await service.startPreviewSession("project-1");
      session.channelOverrides.set("1:1", 255);
      session.channelOverrides.set("1:10", 128);

      // Mock DMX service to return some base values
      mockDmxService.getUniverseChannels.mockReturnValue(
        Array.from({ length: 512 }, (_, i) => i === 4 ? 100 : 0) // Channel 5 = 100
      );

      const channels = await service["getUniverseChannels"](1, session.id);

      expect(channels).toHaveLength(512);
      expect(channels[0]).toBe(255); // Channel 1 override
      expect(channels[4]).toBe(100); // Channel 5 from DMX service
      expect(channels[9]).toBe(128); // Channel 10 override
    });

    it("should return base DMX channels without session", async () => {
      mockDmxService.getUniverseChannels.mockReturnValue([50, 100, 150]);

      const channels = await service["getUniverseChannels"](1);

      expect(channels[0]).toBe(50);
      expect(channels[1]).toBe(100);
      expect(channels[2]).toBe(150);
      expect(channels[3]).toBe(0); // Filled with zeros
    });

    it("should handle channel bounds properly", async () => {
      const session = await service.startPreviewSession("project-1");
      session.channelOverrides.set("1:0", 100);   // Invalid: channel 0
      session.channelOverrides.set("1:513", 200); // Invalid: channel 513
      session.channelOverrides.set("1:512", 255); // Valid: channel 512

      const channels = await service["getUniverseChannels"](1, session.id);

      expect(channels[511]).toBe(255); // Channel 512 (index 511)
      // Invalid channels should not affect array
      expect(channels.every(c => c >= 0 && c <= 255)).toBe(true);
    });
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = getPreviewService();
      const instance2 = getPreviewService();
      expect(instance1).toBe(instance2);
    });

    it("should export previewService as singleton", () => {
      expect(previewService).toBe(getPreviewService());
    });
  });

  describe("session timeout behavior", () => {
    it("should automatically cancel session after timeout", async () => {
      const session = await service.startPreviewSession("project-1");
      const sessionId = session.id;

      expect(service["sessions"].has(sessionId)).toBe(true);

      // Advance time by 30 minutes (timeout period)
      jest.advanceTimersByTime(30 * 60 * 1000);

      expect(service["sessions"].has(sessionId)).toBe(false);
    });

    it("should not cancel session before timeout", async () => {
      const session = await service.startPreviewSession("project-1");
      const sessionId = session.id;

      // Advance time by 29 minutes (less than timeout)
      jest.advanceTimersByTime(29 * 60 * 1000);

      expect(service["sessions"].has(sessionId)).toBe(true);
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple universes in preview", async () => {
      const session = await service.startPreviewSession("project-1");
      session.channelOverrides.set("1:1", 255);
      session.channelOverrides.set("2:10", 128);
      session.channelOverrides.set("3:100", 64);

      const dmxOutput = await service["getCurrentDMXOutput"](session.id);

      expect(dmxOutput).toHaveLength(3);
      expect(dmxOutput.map(u => u.universe).sort()).toEqual([1, 2, 3]);
    });

    it("should handle scene initialization with multiple universes", async () => {
      const session = await service.startPreviewSession("project-1");
      const sceneWithMultiUniverses = {
        id: "scene-1",
        fixtureValues: [
          {
            fixture: {
              id: "fixture-1",
              startChannel: 1,
              universe: 1,
            },
            channelValues: [255],
          },
          {
            fixture: {
              id: "fixture-2",
              startChannel: 1,
              universe: 2,
            },
            channelValues: [128],
          },
        ],
      };
      mockPrisma.scene.findUnique.mockResolvedValue(sceneWithMultiUniverses as any);

      const result = await service.initializeWithScene(session.id, "scene-1");

      expect(result).toBe(true);
      expect(mockPubSub.publish).toHaveBeenCalledTimes(3); // Start + 2 universes
    });
  });
});