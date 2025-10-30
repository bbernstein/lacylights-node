import { fixtureResolvers } from "../fixture";
import { Context } from "../../../context";

// Mock context with Prisma client
const createMockContext = () => ({
  prisma: {
    fixtureInstance: {
      findMany: jest.fn(),
    },
    instanceChannel: {
      findMany: jest.fn(),
    },
  },
  pubsub: {} as any,
});

describe("Channel Assignment Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query.channelMap", () => {
    it("should return empty universes for project with no fixtures", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.projectId).toBe("project-1");
      expect(result.universes).toEqual([]);
      expect(mockContext.prisma.fixtureInstance.findMany).toHaveBeenCalledWith({
        where: { projectId: "project-1" },
        orderBy: [{ universe: "asc" }, { startChannel: "asc" }],
      });
    });

    it("should build channel map for single fixture", async () => {
      const mockContext = createMockContext();
      const mockFixture = {
        id: "fixture-1",
        name: "Test Fixture",
        type: "LED_PAR",
        universe: 1,
        startChannel: 1,
        channelCount: 3,
      };

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([mockFixture]);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
      ]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.projectId).toBe("project-1");
      expect(result.universes).toHaveLength(1);
      expect(result.universes[0].universe).toBe(1);
      expect(result.universes[0].fixtures).toHaveLength(1);
      expect(result.universes[0].fixtures[0]).toEqual({
        id: "fixture-1",
        name: "Test Fixture",
        type: "LED_PAR",
        startChannel: 1,
        endChannel: 3,
        channelCount: 3,
      });
      expect(result.universes[0].usedChannels).toBe(3);
      expect(result.universes[0].availableChannels).toBe(509); // 512 - 3
    });

    it("should handle multiple fixtures in same universe", async () => {
      const mockContext = createMockContext();
      const mockFixtures = [
        {
          id: "fixture-1",
          name: "Fixture 1",
          type: "LED_PAR",
          universe: 1,
          startChannel: 1,
          channelCount: 5,
        },
        {
          id: "fixture-2",
          name: "Fixture 2",
          type: "MOVING_HEAD",
          universe: 1,
          startChannel: 10,
          channelCount: 8,
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures);
      // Mock instanceChannel.findMany to return all channels for all fixtures
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
        { offset: 3, type: "WHITE", fixtureId: "fixture-1" },
        { offset: 4, type: "INTENSITY", fixtureId: "fixture-1" },
        { offset: 0, type: "PAN", fixtureId: "fixture-2" },
        { offset: 1, type: "TILT", fixtureId: "fixture-2" },
        { offset: 2, type: "RED", fixtureId: "fixture-2" },
        { offset: 3, type: "GREEN", fixtureId: "fixture-2" },
        { offset: 4, type: "BLUE", fixtureId: "fixture-2" },
        { offset: 5, type: "WHITE", fixtureId: "fixture-2" },
        { offset: 6, type: "INTENSITY", fixtureId: "fixture-2" },
        { offset: 7, type: "GOBO", fixtureId: "fixture-2" },
      ]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.universes).toHaveLength(1);
      expect(result.universes[0].fixtures).toHaveLength(2);
      expect(result.universes[0].usedChannels).toBe(13); // 5 + 8
      expect(result.universes[0].availableChannels).toBe(499); // 512 - 13
    });

    it("should handle fixtures in multiple universes", async () => {
      const mockContext = createMockContext();
      const mockFixtures = [
        {
          id: "fixture-1",
          name: "Fixture 1",
          type: "LED_PAR",
          universe: 1,
          startChannel: 1,
          channelCount: 5,
        },
        {
          id: "fixture-2",
          name: "Fixture 2",
          type: "MOVING_HEAD",
          universe: 2,
          startChannel: 1,
          channelCount: 8,
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures);
      // Mock instanceChannel.findMany to return all channels for all fixtures
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
        { offset: 3, type: "WHITE", fixtureId: "fixture-1" },
        { offset: 4, type: "INTENSITY", fixtureId: "fixture-1" },
        { offset: 0, type: "PAN", fixtureId: "fixture-2" },
        { offset: 1, type: "TILT", fixtureId: "fixture-2" },
        { offset: 2, type: "RED", fixtureId: "fixture-2" },
        { offset: 3, type: "GREEN", fixtureId: "fixture-2" },
        { offset: 4, type: "BLUE", fixtureId: "fixture-2" },
        { offset: 5, type: "WHITE", fixtureId: "fixture-2" },
        { offset: 6, type: "INTENSITY", fixtureId: "fixture-2" },
        { offset: 7, type: "GOBO", fixtureId: "fixture-2" },
      ]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.universes).toHaveLength(2);
      expect(result.universes[0].universe).toBe(1);
      expect(result.universes[0].usedChannels).toBe(5);
      expect(result.universes[1].universe).toBe(2);
      expect(result.universes[1].usedChannels).toBe(8);
    });

    it("should filter by universe when specified", async () => {
      const mockContext = createMockContext();
      const mockFixtures = [
        {
          id: "fixture-1",
          name: "Fixture 1",
          type: "LED_PAR",
          universe: 1,
          startChannel: 1,
          channelCount: 5,
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
        { offset: 3, type: "WHITE", fixtureId: "fixture-1" },
        { offset: 4, type: "INTENSITY", fixtureId: "fixture-1" },
      ]);

      await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1", universe: 1 },
        mockContext as unknown as Context
      );

      expect(mockContext.prisma.fixtureInstance.findMany).toHaveBeenCalledWith({
        where: { projectId: "project-1", universe: 1 },
        orderBy: [{ universe: "asc" }, { startChannel: "asc" }],
      });
    });

    it("should handle null channelCount gracefully", async () => {
      const mockContext = createMockContext();
      const mockFixture = {
        id: "fixture-1",
        name: "Test Fixture",
        type: "LED_PAR",
        universe: 1,
        startChannel: 1,
        channelCount: null,
      };

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([mockFixture]);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.universes[0].fixtures[0].channelCount).toBe(1);
      expect(result.universes[0].usedChannels).toBe(1);
    });

    it("should handle fixtures that exceed channel 512", async () => {
      const mockContext = createMockContext();
      const mockFixture = {
        id: "fixture-1",
        name: "Test Fixture",
        type: "LED_PAR",
        universe: 1,
        startChannel: 510,
        channelCount: 5, // Would go to channel 514, but max is 512
      };

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([mockFixture]);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
        { offset: 3, type: "WHITE", fixtureId: "fixture-1" },
        { offset: 4, type: "INTENSITY", fixtureId: "fixture-1" },
      ]);

      const result = await fixtureResolvers.Query.channelMap(
        null,
        { projectId: "project-1" },
        mockContext as unknown as Context
      );

      expect(result.universes[0].fixtures[0].endChannel).toBe(512); // Capped at 512
      expect(result.universes[0].usedChannels).toBe(3); // Only channels 510, 511, 512
    });
  });

  describe("Query.suggestChannelAssignment", () => {
    it("should suggest channel 1 for first fixture in empty universe", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "Test Fixture",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 3,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.universe).toBe(1);
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].startChannel).toBe(1);
      expect(result.assignments[0].endChannel).toBe(3);
      expect(result.assignments[0].channelCount).toBe(3);
      expect(result.assignments[0].channelRange).toBe("1-3");
      expect(result.totalChannelsNeeded).toBe(3);
      expect(result.availableChannelsRemaining).toBe(509); // 512 - 3
    });

    it("should suggest next available channel after occupied channels", async () => {
      const mockContext = createMockContext();
      const existingFixture = {
        id: "fixture-1",
        name: "Existing Fixture",
        type: "LED_PAR",
        universe: 1,
        startChannel: 1,
        channelCount: 8,
      };

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([existingFixture]);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "existing-fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "existing-fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "existing-fixture-1" },
        { offset: 3, type: "WHITE", fixtureId: "existing-fixture-1" },
        { offset: 4, type: "AMBER", fixtureId: "existing-fixture-1" },
        { offset: 5, type: "UV", fixtureId: "existing-fixture-1" },
        { offset: 6, type: "INTENSITY", fixtureId: "existing-fixture-1" },
        { offset: 7, type: "STROBE", fixtureId: "existing-fixture-1" },
      ]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "New Fixture",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 5,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments[0].startChannel).toBe(9); // After channel 8
      expect(result.assignments[0].endChannel).toBe(13);
    });

    it("should find gap between fixtures", async () => {
      const mockContext = createMockContext();
      const existingFixtures = [
        {
          id: "fixture-1",
          name: "Fixture 1",
          type: "LED_PAR",
          universe: 1,
          startChannel: 1,
          channelCount: 4,
        },
        {
          id: "fixture-2",
          name: "Fixture 2",
          type: "LED_PAR",
          universe: 1,
          startChannel: 20,
          channelCount: 5,
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(existingFixtures);
      // Mock instanceChannel.findMany to return all channels for all fixtures
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue([
        { offset: 0, type: "RED", fixtureId: "fixture-1" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-1" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-1" },
        { offset: 3, type: "INTENSITY", fixtureId: "fixture-1" },
        { offset: 0, type: "RED", fixtureId: "fixture-2" },
        { offset: 1, type: "GREEN", fixtureId: "fixture-2" },
        { offset: 2, type: "BLUE", fixtureId: "fixture-2" },
        { offset: 3, type: "WHITE", fixtureId: "fixture-2" },
        { offset: 4, type: "INTENSITY", fixtureId: "fixture-2" },
      ]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "New Fixture",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 10,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments[0].startChannel).toBe(5); // Uses gap 5-14
      expect(result.assignments[0].endChannel).toBe(14);
    });

    it("should handle multiple fixtures in one request", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "Fixture 1",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 5,
              },
              {
                name: "Fixture 2",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 5,
              },
              {
                name: "Fixture 3",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 5,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments).toHaveLength(3);
      expect(result.assignments[0].startChannel).toBe(1);
      expect(result.assignments[0].endChannel).toBe(5);
      expect(result.assignments[1].startChannel).toBe(6);
      expect(result.assignments[1].endChannel).toBe(10);
      expect(result.assignments[2].startChannel).toBe(11);
      expect(result.assignments[2].endChannel).toBe(15);
      expect(result.totalChannelsNeeded).toBe(15);
    });

    it("should use default channel count of 4 if not provided", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "Test Fixture",
                manufacturer: "Test",
                model: "Unknown Model",
                // channelCount not provided
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments[0].channelCount).toBe(4);
      expect(result.assignments[0].endChannel).toBe(4);
    });

    it("should throw error if not enough consecutive channels available", async () => {
      const mockContext = createMockContext();
      const existingFixture = {
        id: "fixture-1",
        name: "Existing Fixture",
        type: "LED_PAR",
        universe: 1,
        startChannel: 1,
        channelCount: 510, // Occupies channels 1-510
      };

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([existingFixture]);
      mockContext.prisma.instanceChannel.findMany.mockResolvedValue(
        Array.from({ length: 510 }, (_, i) => ({ offset: i, type: "OTHER", fixtureId: "existing-fixture-1" }))
      );

      await expect(
        fixtureResolvers.Query.suggestChannelAssignment(
          null,
          {
            input: {
              projectId: "project-1",
              universe: 1,
              startingChannel: 1,
              fixtureSpecs: [
                {
                  name: "New Fixture",
                  manufacturer: "Test",
                  model: "Big Fixture",
                  channelCount: 10, // Need 10 channels but only 2 available
                },
              ],
            },
          },
          mockContext as unknown as Context
        )
      ).rejects.toThrow("Not enough consecutive channels available in universe 1");
    });

    it("should respect startingChannel parameter", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 100,
            fixtureSpecs: [
              {
                name: "Test Fixture",
                manufacturer: "Test",
                model: "RGB Par",
                channelCount: 5,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments[0].startChannel).toBe(100);
      expect(result.assignments[0].endChannel).toBe(104);
    });

    it("should include mode information in assignment", async () => {
      const mockContext = createMockContext();
      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue([]);

      const result = await fixtureResolvers.Query.suggestChannelAssignment(
        null,
        {
          input: {
            projectId: "project-1",
            universe: 1,
            startingChannel: 1,
            fixtureSpecs: [
              {
                name: "Test Fixture",
                manufacturer: "Chauvet",
                model: "SlimPar 64",
                mode: "8-channel",
                channelCount: 8,
              },
            ],
          },
        },
        mockContext as unknown as Context
      );

      expect(result.assignments[0].manufacturer).toBe("Chauvet");
      expect(result.assignments[0].model).toBe("SlimPar 64");
      expect(result.assignments[0].mode).toBe("8-channel");
    });
  });
});
