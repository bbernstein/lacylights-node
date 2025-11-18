import { Context } from "../../context";
import { ChannelType, FixtureType } from "../../types/enums";
import { parseTags, serializeTags } from "../../utils/db-helpers";
import { Prisma } from "@prisma/client";
import { OFLImportService } from "../../services/oflImportService";

// Input types for GraphQL queries and mutations
export interface FixtureDefinitionFilter {
  manufacturer?: string;
  model?: string;
  type?: FixtureType;
  isBuiltIn?: boolean;
  channelTypes?: ChannelType[];
}

export interface FixtureUpdateItem {
  fixtureId: string;
  name?: string;
  description?: string;
  universe?: number;
  startChannel?: number;
  tags?: string[];
  layoutX?: number;
  layoutY?: number;
  layoutRotation?: number;
}

export interface BulkFixtureUpdateInput {
  fixtures: FixtureUpdateItem[];
}

// Input type for bulk fixture creation
export interface CreateFixtureInstanceInput {
  projectId: string;
  name: string;
  description?: string;
  definitionId: string;
  modeId?: string;
  universe: number;
  startChannel: number;
  tags?: string[];
}

export interface BulkFixtureCreateInput {
  fixtures: CreateFixtureInstanceInput[];
}

// Shared type for fixture update data to reduce duplication
export interface FixtureUpdateData {
  name?: string;
  description?: string | null;
  universe?: number;
  startChannel?: number;
  tags?: string | null;
  layoutX?: number | null;
  layoutY?: number | null;
  layoutRotation?: number | null;
}

// Type for channel creation data
export interface ChannelCreateData {
  offset: number;
  name: string;
  type: ChannelType;
  minValue: number;
  maxValue: number;
  defaultValue: number;
}

// Type for mode channel with nested channel data
interface ModeChannelWithChannel {
  offset: number;
  channel: {
    name: string;
    type: ChannelType;
    minValue: number;
    maxValue: number;
    defaultValue: number;
  };
}

// Type for definition channel data
interface DefinitionChannel {
  offset: number;
  name: string;
  type: ChannelType;
  minValue: number;
  maxValue: number;
  defaultValue: number;
}

// Input types for fixture instance queries
export interface FixtureInstanceFilter {
  type?: FixtureType;
  universe?: number;
  tags?: string[];
  manufacturer?: string;
  model?: string;
}

export interface FixtureInstancesArgs {
  projectId: string;
  page?: number;
  perPage?: number;
  filter?: FixtureInstanceFilter;
}

export const fixtureResolvers = {
  Query: {
    fixtureInstances: async (
      _: unknown,
      args: FixtureInstancesArgs,
      { prisma }: Context,
    ) => {
      const { projectId, page = 1, perPage = 50 } = args;

      // Validate and normalize pagination parameters
      const normalizedPage = Math.max(1, page);
      const normalizedPerPage = Math.min(100, Math.max(1, perPage));
      const skip = (normalizedPage - 1) * normalizedPerPage;
      const take = normalizedPerPage;

      // Build where clause
      const where: Prisma.FixtureInstanceWhereInput = {
        projectId,
      };

      if (args.filter) {
        if (args.filter.type !== undefined) {
          where.type = args.filter.type;
        }

        if (args.filter.universe !== undefined) {
          where.universe = args.filter.universe;
        }

        if (args.filter.manufacturer) {
          // Note: Using StringFilter for proper type safety with contains pattern
          where.manufacturer = {
            contains: args.filter.manufacturer,
          } as Prisma.StringFilter<"FixtureInstance">;
        }

        if (args.filter.model) {
          // Note: Using StringFilter for proper type safety with contains pattern
          where.model = {
            contains: args.filter.model,
          } as Prisma.StringFilter<"FixtureInstance">;
        }

        if (args.filter.tags && args.filter.tags.length > 0) {
          // Tags are stored as comma-separated string
          // We need to filter for fixtures that have ALL the specified tags
          const tagConditions = args.filter.tags.map((tag) => ({
            tags: {
              contains: tag,
            },
          }));
          where.AND = tagConditions;
        }
      }

      // Execute queries in parallel
      const [fixtures, total] = await Promise.all([
        prisma.fixtureInstance.findMany({
          where,
          skip,
          take,
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
            project: true,
          },
          orderBy: [
            { projectOrder: "asc" },
            { createdAt: "asc" },
          ],
        }),
        prisma.fixtureInstance.count({ where }),
      ]);

      const totalPages = Math.ceil(total / normalizedPerPage);

      return {
        fixtures,
        pagination: {
          total,
          page: normalizedPage,
          perPage: normalizedPerPage,
          totalPages,
          hasMore: normalizedPage < totalPages,
        },
      };
    },

    fixtureInstance: async (
      _: unknown,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      return prisma.fixtureInstance.findUnique({
        where: { id },
        include: {
          channels: {
            orderBy: { offset: "asc" },
          },
          project: true,
        },
      });
    },

    fixtureDefinitions: async (
      _: unknown,
      { filter }: { filter?: FixtureDefinitionFilter },
      { prisma }: Context,
    ) => {
      const where: Record<string, unknown> = {};

      if (filter) {
        // Note: SQLite LIKE (used by contains) is case-insensitive for ASCII characters by default
        // Unlike PostgreSQL's mode:'insensitive', this may be case-sensitive for non-ASCII characters
        if (filter.manufacturer) {
          where.manufacturer = {
            contains: filter.manufacturer,
          };
        }

        if (filter.model) {
          where.model = {
            contains: filter.model,
          };
        }

        if (filter.type !== undefined) {
          where.type = filter.type;
        }

        if (filter.isBuiltIn !== undefined) {
          where.isBuiltIn = filter.isBuiltIn;
        }

        if (filter.channelTypes && filter.channelTypes.length > 0) {
          where.channels = {
            some: {
              type: {
                in: filter.channelTypes,
              },
            },
          };
        }
      }

      return prisma.fixtureDefinition.findMany({
        where,
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
    },

    fixtureDefinition: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      return prisma.fixtureDefinition.findUnique({
        where: { id },
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
    },

    channelMap: async (
      _: any,
      { projectId, universe }: { projectId: string; universe?: number },
      { prisma }: Context,
    ) => {
      // Get all fixtures for the project
      const fixtures = await prisma.fixtureInstance.findMany({
        where: {
          projectId,
          ...(universe ? { universe } : {}),
        },
        orderBy: [{ universe: "asc" }, { startChannel: "asc" }],
      });

      // Fetch all instance channels for all fixtures in a single query
      const fixtureIds = fixtures.map((f) => f.id);
      const allInstanceChannels = fixtureIds.length > 0
        ? await prisma.instanceChannel.findMany({
            where: { fixtureId: { in: fixtureIds } },
            orderBy: { offset: "asc" },
          })
        : [];

      // Create a map of fixtureId -> channels for efficient lookup
      const channelsByFixture = new Map<string, typeof allInstanceChannels>();
      for (const channel of allInstanceChannels) {
        if (!channelsByFixture.has(channel.fixtureId)) {
          channelsByFixture.set(channel.fixtureId, []);
        }
        channelsByFixture.get(channel.fixtureId)!.push(channel);
      }

      // Group fixtures by universe
      const universeMap: Record<
        number,
        {
          universe: number;
          fixtures: any[];
          channelUsage: (null | { fixtureId: string; fixtureName: string; channelType: string })[];
        }
      > = {};

      for (const fixture of fixtures) {
        if (!universeMap[fixture.universe]) {
          universeMap[fixture.universe] = {
            universe: fixture.universe,
            fixtures: [],
            channelUsage: new Array(512).fill(null),
          };
        }

        const endChannel = fixture.startChannel + (fixture.channelCount || 1) - 1;
        const instanceChannels = channelsByFixture.get(fixture.id) || [];

        // Mark channels as used
        for (let i = fixture.startChannel; i <= Math.min(endChannel, 512); i++) {
          const channelIndex = i - fixture.startChannel;
          let channelType: string = ChannelType.OTHER;

          // Get channel type from instance channels if available
          if (instanceChannels.length > channelIndex) {
            channelType = instanceChannels[channelIndex].type;
          }

          universeMap[fixture.universe].channelUsage[i - 1] = {
            fixtureId: fixture.id,
            fixtureName: fixture.name,
            channelType,
          };
        }

        universeMap[fixture.universe].fixtures.push({
          id: fixture.id,
          name: fixture.name,
          type: fixture.type,
          startChannel: fixture.startChannel,
          endChannel: Math.min(endChannel, 512),
          channelCount: fixture.channelCount || 1,
        });
      }

      const universes = Object.values(universeMap).map((u) => ({
        ...u,
        availableChannels: u.channelUsage.filter((ch) => ch === null).length,
        usedChannels: u.channelUsage.filter((ch) => ch !== null).length,
      }));

      return {
        projectId,
        universes,
      };
    },

    suggestChannelAssignment: async (
      _: any,
      { input }: { input: any },
      context: Context,
    ) => {
      const {
        projectId,
        universe = 1,
        startingChannel = 1,
        fixtureSpecs,
      } = input;

      // Get channel map for the universe
      const channelMapResult = await fixtureResolvers.Query.channelMap(
        _,
        { projectId, universe },
        context,
      );

      const universeData = channelMapResult.universes.find(
        (u: any) => u.universe === universe,
      );

      const channelUsage = universeData
        ? universeData.channelUsage
        : new Array(512).fill(null);

      // Helper function to find next available channel block
      const findNextAvailableChannelBlock = (
        startFrom: number,
        channelsNeeded: number,
      ): number => {
        for (let i = startFrom; i <= 512 - channelsNeeded + 1; i++) {
          let blockAvailable = true;
          for (let j = 0; j < channelsNeeded; j++) {
            if (channelUsage[i + j - 1] !== null) {
              blockAvailable = false;
              break;
            }
          }
          if (blockAvailable) {
            return i;
          }
        }
        throw new Error(
          `Not enough consecutive channels available in universe ${universe}`,
        );
      };

      const assignments = [];
      let currentChannel = startingChannel;
      let totalChannelsNeeded = 0;

      for (const spec of fixtureSpecs) {
        // Estimate channel count if not provided (default to 4)
        const channelCount = spec.channelCount || 4;
        totalChannelsNeeded += channelCount;

        // Find next available channel block
        const availableChannel = findNextAvailableChannelBlock(
          currentChannel,
          channelCount,
        );

        const endChannel = availableChannel + channelCount - 1;

        // Mark these channels as used for subsequent fixtures
        for (let i = 0; i < channelCount; i++) {
          channelUsage[availableChannel + i - 1] = {
            fixtureId: "pending",
            fixtureName: spec.name,
            channelType: ChannelType.OTHER,
          };
        }

        assignments.push({
          fixtureName: spec.name,
          manufacturer: spec.manufacturer,
          model: spec.model,
          mode: spec.mode,
          startChannel: availableChannel,
          endChannel,
          channelCount,
          channelRange: `${availableChannel}-${endChannel}`,
        });

        currentChannel = endChannel + 1;
      }

      const availableChannelsRemaining = channelUsage.filter(
        (ch) => ch === null,
      ).length;

      return {
        universe,
        assignments,
        totalChannelsNeeded,
        availableChannelsRemaining,
      };
    },
  },

  Mutation: {
    createFixtureDefinition: async (
      _: any,
      { input }: any,
      { prisma }: Context,
    ) => {
      return prisma.fixtureDefinition.create({
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
    },

    importOFLFixture: async (
      _: any,
      {
        input,
      }: { input: { manufacturer: string; oflFixtureJson: string; replace?: boolean } },
      { prisma }: Context,
    ) => {
      const importService = new OFLImportService(prisma);

      try {
        const result = await importService.importFixture(
          input.manufacturer,
          input.oflFixtureJson,
          input.replace || false,
        );

        // Fetch the complete fixture definition with modes
        return prisma.fixtureDefinition.findUnique({
          where: { id: result.id },
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
            modes: {
              include: {
                modeChannels: {
                  include: {
                    channel: true,
                  },
                  orderBy: { offset: "asc" },
                },
              },
            },
          },
        });
      } catch (error) {
        // Pass through the error message as-is so frontend can parse it
        throw new Error(
          error instanceof Error ? error.message : String(error),
        );
      }
    },

    createFixtureInstance: async (
      _: any,
      { input }: any,
      { prisma }: Context,
    ) => {
      // First, get the definition and mode to determine channels
      const definition = await prisma.fixtureDefinition.findUnique({
        where: { id: input.definitionId },
        include: { channels: true },
      });

      if (!definition) {
        throw new Error("Fixture definition not found");
      }

      let mode = null;
      let channelsToCreate: ChannelCreateData[] = [];

      if (input.modeId) {
        mode = await prisma.fixtureMode.findUnique({
          where: { id: input.modeId },
          include: {
            modeChannels: {
              include: { channel: true },
              orderBy: { offset: "asc" },
            },
          },
        });

        if (mode) {
          channelsToCreate = (mode.modeChannels as ModeChannelWithChannel[]).map((mc) => ({
            offset: mc.offset,
            name: mc.channel.name,
            type: mc.channel.type,
            minValue: mc.channel.minValue,
            maxValue: mc.channel.maxValue,
            defaultValue: mc.channel.defaultValue,
          }));
        }
      }

      // If no mode channels, use definition channels
      if (channelsToCreate.length === 0) {
        channelsToCreate = (definition.channels as DefinitionChannel[])
          .sort((a, b) => a.offset - b.offset)
          .map((ch) => ({
            offset: ch.offset,
            name: ch.name,
            type: ch.type,
            minValue: ch.minValue,
            maxValue: ch.maxValue,
            defaultValue: ch.defaultValue,
          }));
      }

      return prisma.fixtureInstance.create({
        data: {
          name: input.name,
          description: input.description,
          definitionId: input.definitionId,
          projectId: input.projectId,
          universe: input.universe,
          startChannel: input.startChannel,
          tags: input.tags ? serializeTags(input.tags) : null,
          manufacturer: definition.manufacturer,
          model: definition.model,
          type: definition.type,
          modeName: mode?.name || "Default",
          channelCount: mode?.channelCount || definition.channels.length,
          channels: {
            create: channelsToCreate,
          },
        },
        include: {
          channels: {
            orderBy: { offset: "asc" },
          },
          project: true,
        },
      });
    },

    updateFixtureInstance: async (
      _: any,
      { id, input }: { id: string; input: any },
      { prisma }: Context,
    ) => {
      // Only include fields that are provided in the input
      const updateData: any = {};

      if (input.name !== undefined) {
        updateData.name = input.name;
      }

      if (input.description !== undefined) {
        updateData.description = input.description;
      }

      if (input.universe !== undefined) {
        updateData.universe = input.universe;
      }

      if (input.startChannel !== undefined) {
        updateData.startChannel = input.startChannel;
      }

      if (input.tags !== undefined) {
        updateData.tags = input.tags ? serializeTags(input.tags) : null;
      }

      // Update layout position fields
      if (input.layoutX !== undefined) {
        updateData.layoutX = input.layoutX;
      }

      if (input.layoutY !== undefined) {
        updateData.layoutY = input.layoutY;
      }

      if (input.layoutRotation !== undefined) {
        updateData.layoutRotation = input.layoutRotation;
      }

      // If definitionId or modeId is changed, update flattened fields
      if (input.definitionId !== undefined || input.modeId !== undefined) {
        // Get current fixture to preserve values if only one is being changed
        const currentFixture = await prisma.fixtureInstance.findUnique({
          where: { id },
          select: {
            definitionId: true,
          },
        });

        const definitionId = input.definitionId || currentFixture?.definitionId;
        const modeId = input.modeId;

        if (definitionId) {
          // Get the new definition
          const definition = await prisma.fixtureDefinition.findUnique({
            where: { id: definitionId },
            include: { channels: true },
          });

          if (!definition) {
            throw new Error("Fixture definition not found");
          }

          // Update flattened definition fields
          updateData.definitionId = definitionId;
          updateData.manufacturer = definition.manufacturer;
          updateData.model = definition.model;
          updateData.type = definition.type;

          // Handle mode update
          let mode = null;
          let channelsToUpdate: ChannelCreateData[] = [];

          if (modeId) {
            mode = await prisma.fixtureMode.findUnique({
              where: { id: modeId },
              include: {
                modeChannels: {
                  include: { channel: true },
                  orderBy: { offset: "asc" },
                },
              },
            });

            if (mode) {
              updateData.modeName = mode.name;
              updateData.channelCount = mode.channelCount;

              channelsToUpdate = (mode.modeChannels as ModeChannelWithChannel[]).map((mc) => ({
                offset: mc.offset,
                name: mc.channel.name,
                type: mc.channel.type,
                minValue: mc.channel.minValue,
                maxValue: mc.channel.maxValue,
                defaultValue: mc.channel.defaultValue,
              }));
            }
          } else {
            // No mode specified, use definition channels
            updateData.modeName = "Default";
            updateData.channelCount = definition.channels.length;
          }

          // If no mode channels, use definition channels
          if (channelsToUpdate.length === 0) {
            channelsToUpdate = (definition.channels as DefinitionChannel[])
              .sort((a, b) => a.offset - b.offset)
              .map((ch) => ({
                offset: ch.offset,
                name: ch.name,
                type: ch.type,
                minValue: ch.minValue,
                maxValue: ch.maxValue,
                defaultValue: ch.defaultValue,
              }));
          }

          // Delete existing channels and create new ones
          await prisma.instanceChannel.deleteMany({
            where: { fixtureId: id },
          });

          // Create new channels as part of the update
          updateData.channels = {
            create: channelsToUpdate,
          };
        }
      }

      return prisma.fixtureInstance.update({
        where: { id },
        data: updateData,
        include: {
          channels: {
            orderBy: { offset: "asc" },
          },
          project: true,
        },
      });
    },

    deleteFixtureInstance: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      await prisma.fixtureInstance.delete({
        where: { id },
      });
      return true;
    },

    updateFixturePositions: async (
      _: any,
      { positions }: { positions: Array<{ fixtureId: string; layoutX: number; layoutY: number; layoutRotation?: number }> },
      { prisma }: Context,
    ) => {
      // Update all fixtures in a transaction
      await prisma.$transaction(
        positions.map((pos) =>
          prisma.fixtureInstance.update({
            where: { id: pos.fixtureId },
            data: {
              layoutX: pos.layoutX,
              layoutY: pos.layoutY,
              layoutRotation: pos.layoutRotation !== undefined ? pos.layoutRotation : null,
            },
          })
        )
      );
      return true;
    },

    bulkUpdateFixtures: async (
      _: any,
      { input }: { input: BulkFixtureUpdateInput },
      { prisma }: Context,
    ) => {
      // Extract all fixture IDs for validation
      const fixtureIds = input.fixtures.map((f) => f.fixtureId);

      // Verify all fixtures exist first
      const existingFixtures = await prisma.fixtureInstance.findMany({
        where: {
          id: {
            in: fixtureIds,
          },
        },
        include: {
          channels: {
            orderBy: { offset: "asc" },
          },
          project: true,
        },
      });

      if (existingFixtures.length !== fixtureIds.length) {
        const foundIds = new Set(existingFixtures.map((fixture) => fixture.id));
        const missingIds = fixtureIds.filter((id) => !foundIds.has(id));
        throw new Error(`Fixtures not found: ${missingIds.join(", ")}`);
      }

      // Perform bulk update using transaction for consistency
      const updatedFixtures = await prisma.$transaction(
        input.fixtures.map((fixtureUpdate) => {
          // Build update data - only include fields that are provided
          const updateData: FixtureUpdateData = {};

          if (fixtureUpdate.name !== undefined) {
            updateData.name = fixtureUpdate.name;
          }
          if (fixtureUpdate.description !== undefined) {
            updateData.description = fixtureUpdate.description;
          }
          if (fixtureUpdate.universe !== undefined) {
            updateData.universe = fixtureUpdate.universe;
          }
          if (fixtureUpdate.startChannel !== undefined) {
            updateData.startChannel = fixtureUpdate.startChannel;
          }
          if (fixtureUpdate.tags !== undefined) {
            updateData.tags = serializeTags(fixtureUpdate.tags);
          }
          if (fixtureUpdate.layoutX !== undefined) {
            updateData.layoutX = fixtureUpdate.layoutX;
          }
          if (fixtureUpdate.layoutY !== undefined) {
            updateData.layoutY = fixtureUpdate.layoutY;
          }
          if (fixtureUpdate.layoutRotation !== undefined) {
            updateData.layoutRotation = fixtureUpdate.layoutRotation;
          }

          return prisma.fixtureInstance.update({
            where: { id: fixtureUpdate.fixtureId },
            data: updateData,
            include: {
              channels: {
                orderBy: { offset: "asc" },
              },
              project: true,
            },
          });
        }),
      );

      return updatedFixtures;
    },

    bulkCreateFixtures: async (
      _: any,
      { input }: { input: BulkFixtureCreateInput },
      { prisma }: Context,
    ) => {
      // Process each fixture input and create them in a transaction
      const createdFixtures = await prisma.$transaction(async (tx) => {
        const results = [];

        for (const fixtureInput of input.fixtures) {
          // First, get the definition and mode to determine channels
          const definition = await tx.fixtureDefinition.findUnique({
            where: { id: fixtureInput.definitionId },
            include: { channels: true },
          });

          if (!definition) {
            throw new Error(`Fixture definition not found: ${fixtureInput.definitionId}`);
          }

          let mode = null;
          let channelsToCreate: ChannelCreateData[] = [];

          if (fixtureInput.modeId) {
            mode = await tx.fixtureMode.findUnique({
              where: { id: fixtureInput.modeId },
              include: {
                modeChannels: {
                  include: { channel: true },
                  orderBy: { offset: "asc" },
                },
              },
            });

            if (mode) {
              channelsToCreate = (mode.modeChannels as ModeChannelWithChannel[]).map((mc) => ({
                offset: mc.offset,
                name: mc.channel.name,
                type: mc.channel.type,
                minValue: mc.channel.minValue,
                maxValue: mc.channel.maxValue,
                defaultValue: mc.channel.defaultValue,
              }));
            }
          }

          // If no mode channels, use definition channels
          if (channelsToCreate.length === 0) {
            channelsToCreate = (definition.channels as DefinitionChannel[])
              .sort((a, b) => a.offset - b.offset)
              .map((ch) => ({
                offset: ch.offset,
                name: ch.name,
                type: ch.type,
                minValue: ch.minValue,
                maxValue: ch.maxValue,
                defaultValue: ch.defaultValue,
              }));
          }

          const createdFixture = await tx.fixtureInstance.create({
            data: {
              name: fixtureInput.name,
              description: fixtureInput.description,
              definitionId: fixtureInput.definitionId,
              projectId: fixtureInput.projectId,
              universe: fixtureInput.universe,
              startChannel: fixtureInput.startChannel,
              tags: fixtureInput.tags ? serializeTags(fixtureInput.tags) : null,
              manufacturer: definition.manufacturer,
              model: definition.model,
              type: definition.type,
              modeName: mode?.name || "Default",
              channelCount: mode?.channelCount || definition.channels.length,
              channels: {
                create: channelsToCreate,
              },
            },
            include: {
              channels: {
                orderBy: { offset: "asc" },
              },
              project: true,
            },
          });

          results.push(createdFixture);
        }

        return results;
      });

      return createdFixtures;
    },
  },

  types: {
    FixtureInstance: {
      channels: (parent: any, _: any, { prisma }: Context) => {
        return prisma.instanceChannel.findMany({
          where: { fixtureId: parent.id },
          orderBy: { offset: "asc" },
        });
      },
      tags: (parent: any) => {
        return parseTags(parent.tags);
      },
    },

    FixtureMode: {
      channels: (parent: any) => {
        return parent.modeChannels || [];
      },
    },

    ModeChannel: {
      channel: (parent: any) => {
        return parent.channel;
      },
    },
  },
};
