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
      delete: jest.fn(),
    },
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
              mode: "insensitive",
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
              mode: "insensitive",
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
              mode: "insensitive",
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
            modeId: undefined,
            projectId: input.projectId,
            universe: input.universe,
            startChannel: input.startChannel,
            tags: input.tags,
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
          data: input,
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
