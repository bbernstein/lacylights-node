import { fixtureResolvers } from "../fixture";
import type { Context } from "../../../context";
import { FixtureType, ChannelType } from "../../../types/enums";

const mockContext: Context = {
  prisma: {
    fixtureDefinition: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    fixtureInstance: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    fixtureMode: {
      findUnique: jest.fn(),
    },
    instanceChannel: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe("Fixture Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Query", () => {
    describe("fixtureDefinitions", () => {
      it("should return all fixture definitions without filter", async () => {
        const mockDefinitions = [
          {
            id: "def-1",
            manufacturer: "Chauvet",
            model: "SlimPAR Pro H",
            type: FixtureType.LED_PAR,
            channels: [
              { name: "Red", type: ChannelType.RED, offset: 0 },
              { name: "Green", type: ChannelType.GREEN, offset: 1 },
            ],
            modes: [],
          },
        ];

        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue(mockDefinitions);

        const result = await fixtureResolvers.Query.fixtureDefinitions(
          {},
          {},
          mockContext,
        );

        expect(result).toEqual(mockDefinitions);
        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {},
          include: {
            channels: true,
            modes: {
              include: {
                modeChannels: {
                  include: {
                    channel: true,
                  },
                  orderBy: {
                    offset: "asc",
                  },
                },
              },
            },
          },
        });
      });

      it("should filter by manufacturer", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          { filter: { manufacturer: "Chauvet" } },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            manufacturer: {
              contains: "Chauvet",
            },
          },
          include: expect.any(Object),
        });
      });

      it("should filter by model", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          { filter: { model: "SlimPAR" } },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            model: {
              contains: "SlimPAR",
            },
          },
          include: expect.any(Object),
        });
      });

      it("should filter by type", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          { filter: { type: FixtureType.LED_PAR } },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            type: FixtureType.LED_PAR,
          },
          include: expect.any(Object),
        });
      });

      it("should filter by isBuiltIn", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          { filter: { isBuiltIn: true } },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            isBuiltIn: true,
          },
          include: expect.any(Object),
        });
      });

      it("should filter by channel types", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          { filter: { channelTypes: [ChannelType.RED, ChannelType.GREEN] } },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            channels: {
              some: {
                type: {
                  in: [ChannelType.RED, ChannelType.GREEN],
                },
              },
            },
          },
          include: expect.any(Object),
        });
      });

      it("should combine multiple filters", async () => {
        mockContext.prisma.fixtureDefinition.findMany = jest
          .fn()
          .mockResolvedValue([]);

        await fixtureResolvers.Query.fixtureDefinitions(
          {},
          {
            filter: {
              manufacturer: "Chauvet",
              type: FixtureType.LED_PAR,
              isBuiltIn: false,
            },
          },
          mockContext,
        );

        expect(
          mockContext.prisma.fixtureDefinition.findMany,
        ).toHaveBeenCalledWith({
          where: {
            manufacturer: {
              contains: "Chauvet",
            },
            type: FixtureType.LED_PAR,
            isBuiltIn: false,
          },
          include: expect.any(Object),
        });
      });
    });

    describe("fixtureDefinition", () => {
      it("should return fixture definition by id", async () => {
        const mockDefinition = {
          id: "def-1",
          manufacturer: "Chauvet",
          model: "SlimPAR Pro H",
          channels: [],
          modes: [],
        };

        mockContext.prisma.fixtureDefinition.findUnique = jest
          .fn()
          .mockResolvedValue(mockDefinition);

        const result = await fixtureResolvers.Query.fixtureDefinition(
          {},
          { id: "def-1" },
          mockContext,
        );

        expect(result).toEqual(mockDefinition);
        expect(
          mockContext.prisma.fixtureDefinition.findUnique,
        ).toHaveBeenCalledWith({
          where: { id: "def-1" },
          include: {
            channels: true,
            modes: {
              include: {
                modeChannels: {
                  include: {
                    channel: true,
                  },
                  orderBy: {
                    offset: "asc",
                  },
                },
              },
            },
          },
        });
      });
    });
  });

  describe("Mutation", () => {
    describe("createFixtureDefinition", () => {
      it("should create fixture definition", async () => {
        const input = {
          manufacturer: "Chauvet",
          model: "SlimPAR Pro H",
          type: FixtureType.LED_PAR,
          channels: [
            { name: "Red", type: ChannelType.RED, offset: 0 },
            { name: "Green", type: ChannelType.GREEN, offset: 1 },
          ],
        };

        const mockResult = {
          id: "def-1",
          ...input,
          channels: input.channels,
        };

        mockContext.prisma.fixtureDefinition.create = jest
          .fn()
          .mockResolvedValue(mockResult);

        const result = await fixtureResolvers.Mutation.createFixtureDefinition(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockResult);
        expect(
          mockContext.prisma.fixtureDefinition.create,
        ).toHaveBeenCalledWith({
          data: {
            manufacturer: input.manufacturer,
            model: input.model,
            type: input.type,
            channels: {
              create: input.channels,
            },
          },
          include: {
            channels: true,
          },
        });
      });
    });

    describe("createFixtureInstance", () => {
      const mockDefinition = {
        id: "def-1",
        manufacturer: "Chauvet",
        model: "SlimPAR Pro H",
        type: FixtureType.LED_PAR,
        channels: [
          {
            offset: 0,
            name: "Red",
            type: ChannelType.RED,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
          {
            offset: 1,
            name: "Green",
            type: ChannelType.GREEN,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
        ],
      };

      beforeEach(() => {
        mockContext.prisma.fixtureDefinition.findUnique = jest
          .fn()
          .mockResolvedValue(mockDefinition);
      });

      it("should create fixture instance with definition channels", async () => {
        const input = {
          name: "Test Fixture",
          description: "Test fixture instance",
          definitionId: "def-1",
          projectId: "proj-1",
          universe: 1,
          startChannel: 1,
          tags: ["front", "wash"],
        };

        const mockResult = {
          id: "fixture-1",
          ...input,
          manufacturer: mockDefinition.manufacturer,
          model: mockDefinition.model,
          type: mockDefinition.type,
          modeName: "Default",
          channelCount: 2,
          channels: mockDefinition.channels,
        };

        mockContext.prisma.fixtureInstance.create = jest
          .fn()
          .mockResolvedValue(mockResult);

        const result = await fixtureResolvers.Mutation.createFixtureInstance(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockResult);
        expect(mockContext.prisma.fixtureInstance.create).toHaveBeenCalledWith({
          data: {
            name: input.name,
            description: input.description,
            definitionId: input.definitionId,
            projectId: input.projectId,
            universe: input.universe,
            startChannel: input.startChannel,
            tags: '["front","wash"]',
            manufacturer: mockDefinition.manufacturer,
            model: mockDefinition.model,
            type: mockDefinition.type,
            modeName: "Default",
            channelCount: 2,
            channels: {
              create: mockDefinition.channels.map((ch) => ({
                offset: ch.offset,
                name: ch.name,
                type: ch.type,
                minValue: ch.minValue,
                maxValue: ch.maxValue,
                defaultValue: ch.defaultValue,
              })),
            },
          },
          include: expect.any(Object),
        });
      });

      it("should create fixture instance with mode channels", async () => {
        const mockMode = {
          id: "mode-1",
          name: "RGB Mode",
          channelCount: 3,
          modeChannels: [
            {
              offset: 0,
              channel: {
                name: "Red",
                type: ChannelType.RED,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            },
            {
              offset: 1,
              channel: {
                name: "Green",
                type: ChannelType.GREEN,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            },
          ],
        };

        const input = {
          name: "Test Fixture",
          definitionId: "def-1",
          modeId: "mode-1",
          projectId: "proj-1",
          universe: 1,
          startChannel: 1,
        };

        mockContext.prisma.fixtureMode.findUnique = jest
          .fn()
          .mockResolvedValue(mockMode);

        const mockResult = {
          id: "fixture-1",
          ...input,
          manufacturer: mockDefinition.manufacturer,
          model: mockDefinition.model,
          type: mockDefinition.type,
          modeName: mockMode.name,
          channelCount: mockMode.channelCount,
        };

        mockContext.prisma.fixtureInstance.create = jest
          .fn()
          .mockResolvedValue(mockResult);

        const result = await fixtureResolvers.Mutation.createFixtureInstance(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(mockResult);
        expect(mockContext.prisma.fixtureInstance.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            modeName: "RGB Mode",
            channelCount: 3,
            channels: {
              create: [
                {
                  offset: 0,
                  name: "Red",
                  type: ChannelType.RED,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                },
                {
                  offset: 1,
                  name: "Green",
                  type: ChannelType.GREEN,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                },
              ],
            },
          }),
          include: expect.any(Object),
        });
      });

      it("should throw error when definition not found", async () => {
        mockContext.prisma.fixtureDefinition.findUnique = jest
          .fn()
          .mockResolvedValue(null);

        const input = {
          name: "Test Fixture",
          definitionId: "non-existent",
          projectId: "proj-1",
          universe: 1,
          startChannel: 1,
        };

        await expect(
          fixtureResolvers.Mutation.createFixtureInstance(
            {},
            { input },
            mockContext,
          ),
        ).rejects.toThrow("Fixture definition not found");
      });
    });

    describe("updateFixtureInstance", () => {
      it("should update simple fields", async () => {
        const input = {
          name: "Updated Fixture",
          description: "Updated description",
          universe: 2,
          startChannel: 10,
          tags: ["updated"],
        };

        const mockResult = {
          id: "fixture-1",
          ...input,
        };

        mockContext.prisma.fixtureInstance.update = jest
          .fn()
          .mockResolvedValue(mockResult);

        const result = await fixtureResolvers.Mutation.updateFixtureInstance(
          {},
          { id: "fixture-1", input },
          mockContext,
        );

        expect(result).toEqual(mockResult);
        expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledWith({
          where: { id: "fixture-1" },
          data: {
            name: "Updated Fixture",
            description: "Updated description",
            universe: 2,
            startChannel: 10,
            tags: '["updated"]',
          },
          include: expect.any(Object),
        });
      });

      it("should update definition and regenerate channels", async () => {
        const currentFixture = {
          definitionId: "old-def",
          modeId: null,
        };

        const newDefinition = {
          id: "new-def",
          manufacturer: "ETC",
          model: "ColorSource PAR",
          type: FixtureType.LED_PAR,
          channels: [
            {
              offset: 0,
              name: "Intensity",
              type: ChannelType.INTENSITY,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
          ],
        };

        mockContext.prisma.fixtureInstance.findUnique = jest
          .fn()
          .mockResolvedValue(currentFixture);
        mockContext.prisma.fixtureDefinition.findUnique = jest
          .fn()
          .mockResolvedValue(newDefinition);
        mockContext.prisma.instanceChannel.deleteMany = jest
          .fn()
          .mockResolvedValue({});

        const input = {
          definitionId: "new-def",
        };

        const mockResult = {
          id: "fixture-1",
          definitionId: "new-def",
          manufacturer: "ETC",
          model: "ColorSource PAR",
          type: FixtureType.LED_PAR,
        };

        mockContext.prisma.fixtureInstance.update = jest
          .fn()
          .mockResolvedValue(mockResult);

        const result = await fixtureResolvers.Mutation.updateFixtureInstance(
          {},
          { id: "fixture-1", input },
          mockContext,
        );

        expect(
          mockContext.prisma.instanceChannel.deleteMany,
        ).toHaveBeenCalledWith({
          where: { fixtureId: "fixture-1" },
        });

        expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledWith({
          where: { id: "fixture-1" },
          data: expect.objectContaining({
            definitionId: "new-def",
            manufacturer: "ETC",
            model: "ColorSource PAR",
            type: FixtureType.LED_PAR,
            modeName: "Default",
            channelCount: 1,
            channels: {
              create: [
                {
                  offset: 0,
                  name: "Intensity",
                  type: ChannelType.INTENSITY,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                },
              ],
            },
          }),
          include: expect.any(Object),
        });

        expect(result).toEqual(mockResult);
      });

      it("should throw error when new definition not found", async () => {
        const currentFixture = {
          definitionId: "old-def",
          modeId: null,
        };

        mockContext.prisma.fixtureInstance.findUnique = jest
          .fn()
          .mockResolvedValue(currentFixture);
        mockContext.prisma.fixtureDefinition.findUnique = jest
          .fn()
          .mockResolvedValue(null);

        const input = {
          definitionId: "non-existent",
        };

        await expect(
          fixtureResolvers.Mutation.updateFixtureInstance(
            {},
            { id: "fixture-1", input },
            mockContext,
          ),
        ).rejects.toThrow("Fixture definition not found");
      });
    });

    describe("deleteFixtureInstance", () => {
      it("should delete fixture instance", async () => {
        mockContext.prisma.fixtureInstance.delete = jest
          .fn()
          .mockResolvedValue({});

        const result = await fixtureResolvers.Mutation.deleteFixtureInstance(
          {},
          { id: "fixture-1" },
          mockContext,
        );

        expect(result).toBe(true);
        expect(mockContext.prisma.fixtureInstance.delete).toHaveBeenCalledWith({
          where: { id: "fixture-1" },
        });
      });
    });

    describe("bulkUpdateFixtures", () => {
      it("should update multiple fixtures with different values", async () => {
        const existingFixtures = [
          {
            id: "fixture-1",
            name: "Old Name 1",
            channels: [],
            project: {},
          },
          {
            id: "fixture-2",
            name: "Old Name 2",
            channels: [],
            project: {},
          },
        ];

        const updatedFixtures = [
          {
            id: "fixture-1",
            name: "New Name 1",
            description: "Updated fixture 1",
            channels: [],
            project: {},
          },
          {
            id: "fixture-2",
            name: "New Name 2",
            tags: '["updated"]',
            channels: [],
            project: {},
          },
        ];

        mockContext.prisma.fixtureInstance.findMany = jest
          .fn()
          .mockResolvedValue(existingFixtures);

        // Mock $transaction to execute the callback and return the results
        mockContext.prisma.$transaction = jest.fn().mockImplementation(() => {
          return Promise.resolve(updatedFixtures);
        });

        const input = {
          fixtures: [
            {
              fixtureId: "fixture-1",
              name: "New Name 1",
              description: "Updated fixture 1",
            },
            {
              fixtureId: "fixture-2",
              name: "New Name 2",
              tags: ["updated"],
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkUpdateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(updatedFixtures);
        expect(mockContext.prisma.fixtureInstance.findMany).toHaveBeenCalledWith({
          where: {
            id: {
              in: ["fixture-1", "fixture-2"],
            },
          },
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
            project: true,
          },
        });
        expect(mockContext.prisma.$transaction).toHaveBeenCalled();
      });

      it("should update only provided fields", async () => {
        const existingFixtures = [
          {
            id: "fixture-1",
            name: "Existing Name",
            channels: [],
            project: {},
          },
        ];

        const updatedFixtures = [
          {
            id: "fixture-1",
            name: "Existing Name",
            universe: 2,
            startChannel: 100,
            channels: [],
            project: {},
          },
        ];

        mockContext.prisma.fixtureInstance.findMany = jest
          .fn()
          .mockResolvedValue(existingFixtures);

        mockContext.prisma.$transaction = jest.fn().mockImplementation(() => {
          return Promise.resolve(updatedFixtures);
        });

        const input = {
          fixtures: [
            {
              fixtureId: "fixture-1",
              universe: 2,
              startChannel: 100,
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkUpdateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(updatedFixtures);
      });

      it("should update layout positions", async () => {
        const existingFixtures = [
          {
            id: "fixture-1",
            layoutX: 0.5,
            layoutY: 0.5,
            layoutRotation: 0,
            channels: [],
            project: {},
          },
        ];

        const updatedFixtures = [
          {
            id: "fixture-1",
            layoutX: 0.3,
            layoutY: 0.7,
            layoutRotation: 45,
            channels: [],
            project: {},
          },
        ];

        mockContext.prisma.fixtureInstance.findMany = jest
          .fn()
          .mockResolvedValue(existingFixtures);

        mockContext.prisma.$transaction = jest.fn().mockImplementation(() => {
          return Promise.resolve(updatedFixtures);
        });

        const input = {
          fixtures: [
            {
              fixtureId: "fixture-1",
              layoutX: 0.3,
              layoutY: 0.7,
              layoutRotation: 45,
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkUpdateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(updatedFixtures);
      });

      it("should throw error when fixtures not found", async () => {
        mockContext.prisma.fixtureInstance.findMany = jest
          .fn()
          .mockResolvedValue([
            {
              id: "fixture-1",
              channels: [],
              project: {},
            },
          ]);

        const input = {
          fixtures: [
            {
              fixtureId: "fixture-1",
              name: "Name 1",
            },
            {
              fixtureId: "fixture-2",
              name: "Name 2",
            },
          ],
        };

        await expect(
          fixtureResolvers.Mutation.bulkUpdateFixtures(
            {},
            { input },
            mockContext,
          ),
        ).rejects.toThrow("Fixtures not found: fixture-2");
      });

      it("should handle tags serialization", async () => {
        const existingFixtures = [
          {
            id: "fixture-1",
            tags: null,
            channels: [],
            project: {},
          },
        ];

        const updatedFixtures = [
          {
            id: "fixture-1",
            tags: '["tag1","tag2"]',
            channels: [],
            project: {},
          },
        ];

        mockContext.prisma.fixtureInstance.findMany = jest
          .fn()
          .mockResolvedValue(existingFixtures);

        mockContext.prisma.$transaction = jest.fn().mockImplementation(() => {
          return Promise.resolve(updatedFixtures);
        });

        const input = {
          fixtures: [
            {
              fixtureId: "fixture-1",
              tags: ["tag1", "tag2"],
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkUpdateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(updatedFixtures);
      });
    });

    describe("bulkCreateFixtures", () => {
      const mockDefinition = {
        id: "def-1",
        manufacturer: "Chauvet",
        model: "SlimPAR Pro H",
        type: FixtureType.LED_PAR,
        channels: [
          {
            offset: 0,
            name: "Red",
            type: ChannelType.RED,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
          {
            offset: 1,
            name: "Green",
            type: ChannelType.GREEN,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
        ],
      };

      it("should create multiple fixtures in a transaction", async () => {
        const createdFixtures = [
          {
            id: "fixture-1",
            name: "Fixture 1",
            manufacturer: "Chauvet",
            model: "SlimPAR Pro H",
            type: FixtureType.LED_PAR,
            universe: 1,
            startChannel: 1,
            modeName: "Default",
            channelCount: 2,
            channels: mockDefinition.channels,
            project: {},
          },
          {
            id: "fixture-2",
            name: "Fixture 2",
            manufacturer: "Chauvet",
            model: "SlimPAR Pro H",
            type: FixtureType.LED_PAR,
            universe: 1,
            startChannel: 10,
            modeName: "Default",
            channelCount: 2,
            channels: mockDefinition.channels,
            project: {},
          },
        ];

        // Mock $transaction to execute the callback and return the results
        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => {
            // Simulate the transaction callback execution
            const tx = {
              fixtureDefinition: {
                findUnique: jest.fn().mockResolvedValue(mockDefinition),
              },
              fixtureMode: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
              fixtureInstance: {
                create: jest
                  .fn()
                  .mockResolvedValueOnce(createdFixtures[0])
                  .mockResolvedValueOnce(createdFixtures[1]),
              },
            };
            return await callback(tx);
          });

        const input = {
          fixtures: [
            {
              name: "Fixture 1",
              definitionId: "def-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
            },
            {
              name: "Fixture 2",
              definitionId: "def-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 10,
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkCreateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual(createdFixtures);
        expect(mockContext.prisma.$transaction).toHaveBeenCalled();
      });

      it("should create fixtures with mode channels", async () => {
        const mockMode = {
          id: "mode-1",
          name: "RGB Mode",
          channelCount: 3,
          modeChannels: [
            {
              offset: 0,
              channel: {
                name: "Red",
                type: ChannelType.RED,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            },
            {
              offset: 1,
              channel: {
                name: "Green",
                type: ChannelType.GREEN,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            },
            {
              offset: 2,
              channel: {
                name: "Blue",
                type: ChannelType.BLUE,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0,
              },
            },
          ],
        };

        const createdFixture = {
          id: "fixture-1",
          name: "Fixture with Mode",
          manufacturer: "Chauvet",
          model: "SlimPAR Pro H",
          type: FixtureType.LED_PAR,
          universe: 1,
          startChannel: 1,
          modeName: "RGB Mode",
          channelCount: 3,
          channels: [
            {
              offset: 0,
              name: "Red",
              type: ChannelType.RED,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
            {
              offset: 1,
              name: "Green",
              type: ChannelType.GREEN,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
            {
              offset: 2,
              name: "Blue",
              type: ChannelType.BLUE,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0,
            },
          ],
          project: {},
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => {
            const tx = {
              fixtureDefinition: {
                findUnique: jest.fn().mockResolvedValue(mockDefinition),
              },
              fixtureMode: {
                findUnique: jest.fn().mockResolvedValue(mockMode),
              },
              fixtureInstance: {
                create: jest.fn().mockResolvedValue(createdFixture),
              },
            };
            return await callback(tx);
          });

        const input = {
          fixtures: [
            {
              name: "Fixture with Mode",
              definitionId: "def-1",
              modeId: "mode-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkCreateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual([createdFixture]);
      });

      it("should create fixtures with tags", async () => {
        const createdFixture = {
          id: "fixture-1",
          name: "Tagged Fixture",
          manufacturer: "Chauvet",
          model: "SlimPAR Pro H",
          type: FixtureType.LED_PAR,
          tags: '["front","wash","blue"]',
          universe: 1,
          startChannel: 1,
          modeName: "Default",
          channelCount: 2,
          channels: mockDefinition.channels,
          project: {},
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => {
            const tx = {
              fixtureDefinition: {
                findUnique: jest.fn().mockResolvedValue(mockDefinition),
              },
              fixtureMode: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
              fixtureInstance: {
                create: jest.fn().mockResolvedValue(createdFixture),
              },
            };
            return await callback(tx);
          });

        const input = {
          fixtures: [
            {
              name: "Tagged Fixture",
              definitionId: "def-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
              tags: ["front", "wash", "blue"],
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkCreateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual([createdFixture]);
      });

      it("should throw error when definition not found", async () => {
        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => {
            const tx = {
              fixtureDefinition: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
            };
            return await callback(tx);
          });

        const input = {
          fixtures: [
            {
              name: "Fixture 1",
              definitionId: "non-existent",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
            },
          ],
        };

        await expect(
          fixtureResolvers.Mutation.bulkCreateFixtures(
            {},
            { input },
            mockContext,
          ),
        ).rejects.toThrow("Fixture definition not found: non-existent");
      });

      it("should handle transaction rollback on error", async () => {
        mockContext.prisma.$transaction = jest.fn().mockRejectedValue(
          new Error("Transaction failed"),
        );

        const input = {
          fixtures: [
            {
              name: "Fixture 1",
              definitionId: "def-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
            },
          ],
        };

        await expect(
          fixtureResolvers.Mutation.bulkCreateFixtures(
            {},
            { input },
            mockContext,
          ),
        ).rejects.toThrow("Transaction failed");
      });

      it("should create fixtures with optional description", async () => {
        const createdFixture = {
          id: "fixture-1",
          name: "Fixture 1",
          description: "Test Description",
          manufacturer: "Chauvet",
          model: "SlimPAR Pro H",
          type: FixtureType.LED_PAR,
          universe: 1,
          startChannel: 1,
          modeName: "Default",
          channelCount: 2,
          channels: mockDefinition.channels,
          project: {},
        };

        mockContext.prisma.$transaction = jest
          .fn()
          .mockImplementation(async (callback) => {
            const tx = {
              fixtureDefinition: {
                findUnique: jest.fn().mockResolvedValue(mockDefinition),
              },
              fixtureMode: {
                findUnique: jest.fn().mockResolvedValue(null),
              },
              fixtureInstance: {
                create: jest.fn().mockResolvedValue(createdFixture),
              },
            };
            return await callback(tx);
          });

        const input = {
          fixtures: [
            {
              name: "Fixture 1",
              description: "Test Description",
              definitionId: "def-1",
              projectId: "proj-1",
              universe: 1,
              startChannel: 1,
            },
          ],
        };

        const result = await fixtureResolvers.Mutation.bulkCreateFixtures(
          {},
          { input },
          mockContext,
        );

        expect(result).toEqual([createdFixture]);
      });
    });
  });

  describe("types", () => {
    describe("FixtureInstance.channels", () => {
      it("should return ordered instance channels", async () => {
        const parent = { id: "fixture-1" };
        const mockChannels = [
          { offset: 0, name: "Red" },
          { offset: 1, name: "Green" },
        ];

        mockContext.prisma.instanceChannel.findMany = jest
          .fn()
          .mockResolvedValue(mockChannels);

        const result = await fixtureResolvers.types.FixtureInstance.channels(
          parent,
          {},
          mockContext,
        );

        expect(result).toEqual(mockChannels);
        expect(
          mockContext.prisma.instanceChannel.findMany,
        ).toHaveBeenCalledWith({
          where: { fixtureId: "fixture-1" },
          orderBy: { offset: "asc" },
        });
      });
    });

    describe("FixtureMode.channels", () => {
      it("should return mode channels", () => {
        const parent = {
          modeChannels: [
            { offset: 0, channel: { name: "Red" } },
            { offset: 1, channel: { name: "Green" } },
          ],
        };

        const result = fixtureResolvers.types.FixtureMode.channels(parent);

        expect(result).toEqual(parent.modeChannels);
      });

      it("should return empty array when no mode channels", () => {
        const parent = {};

        const result = fixtureResolvers.types.FixtureMode.channels(parent);

        expect(result).toEqual([]);
      });
    });

    describe("ModeChannel.channel", () => {
      it("should return channel from mode channel", () => {
        const parent = {
          channel: { name: "Red", type: ChannelType.RED },
        };

        const result = fixtureResolvers.types.ModeChannel.channel(parent);

        expect(result).toEqual(parent.channel);
      });
    });
  });
});
