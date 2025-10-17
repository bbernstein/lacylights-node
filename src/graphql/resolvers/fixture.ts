import { Context } from "../../context";
import { ChannelType, FixtureType } from "../../types/enums";
import { parseTags, serializeTags } from "../../utils/db-helpers";

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

// Note: Interface definitions removed as they are not used in current resolvers
// They would be needed when implementing create/update mutations

export const fixtureResolvers = {
  Query: {
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
      let channelsToCreate: Array<{
        offset: number;
        name: string;
        type: any;
        minValue: number;
        maxValue: number;
        defaultValue: number;
      }> = [];

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
          channelsToCreate = mode.modeChannels.map((mc: any) => ({
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
        channelsToCreate = definition.channels
          .sort((a: any, b: any) => a.offset - b.offset)
          .map((ch: any) => ({
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
          let channelsToUpdate: Array<{
            offset: number;
            name: string;
            type: ChannelType;
            minValue: number;
            maxValue: number;
            defaultValue: number;
          }> = [];

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

              channelsToUpdate = mode.modeChannels.map((mc: any) => ({
                offset: mc.offset,
                name: mc.channel.name,
                type: mc.channel.type as ChannelType,
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
            channelsToUpdate = definition.channels
              .sort((a: any, b: any) => a.offset - b.offset)
              .map((ch: any) => ({
                offset: ch.offset,
                name: ch.name,
                type: ch.type as ChannelType,
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
          const updateData: any = {};

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
            updateData.tags = fixtureUpdate.tags ? serializeTags(fixtureUpdate.tags) : null;
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
      { input }: { input: { fixtures: any[] } },
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
          let channelsToCreate: Array<{
            offset: number;
            name: string;
            type: any;
            minValue: number;
            maxValue: number;
            defaultValue: number;
          }> = [];

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
              channelsToCreate = mode.modeChannels.map((mc: any) => ({
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
            channelsToCreate = definition.channels
              .sort((a: any, b: any) => a.offset - b.offset)
              .map((ch: any) => ({
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
