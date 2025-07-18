import { Context } from '../../context';

export const fixtureResolvers = {
  Query: {
    fixtureDefinitions: async (_: any, { filter }: { filter?: any }, { prisma }: Context) => {
      const where: any = {};
      
      if (filter) {
        if (filter.manufacturer) {
          where.manufacturer = {
            contains: filter.manufacturer,
            mode: 'insensitive',
          };
        }
        
        if (filter.model) {
          where.model = {
            contains: filter.model,
            mode: 'insensitive',
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
                  offset: 'asc',
                },
              },
            },
          },
        },
      });
    },

    fixtureDefinition: async (_: any, { id }: { id: string }, { prisma }: Context) => {
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
                  offset: 'asc',
                },
              },
            },
          },
        },
      });
    },
  },

  Mutation: {
    createFixtureDefinition: async (_: any, { input }: any, { prisma }: Context) => {
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

    createFixtureInstance: async (_: any, { input }: any, { prisma }: Context) => {
      // First, get the definition and mode to determine channels
      const definition = await prisma.fixtureDefinition.findUnique({
        where: { id: input.definitionId },
        include: { channels: true },
      });
      
      if (!definition) {
        throw new Error('Fixture definition not found');
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
              orderBy: { offset: 'asc' },
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
          modeId: input.modeId,
          projectId: input.projectId,
          universe: input.universe,
          startChannel: input.startChannel,
          tags: input.tags,
          manufacturer: definition.manufacturer,
          model: definition.model,
          type: definition.type,
          modeName: mode?.name || 'Default',
          channelCount: mode?.channelCount || definition.channels.length,
          channels: {
            create: channelsToCreate,
          },
        },
        include: {
          channels: {
            orderBy: { offset: 'asc' },
          },
          definition: {
            include: {
              channels: true,
              modes: {
                include: {
                  modeChannels: {
                    include: {
                      channel: true,
                    },
                  },
                },
              },
            },
          },
          project: true,
        },
      });
    },

    updateFixtureInstance: async (_: any, { id, input }: { id: string; input: any }, { prisma }: Context) => {
      // Only include fields that are provided in the input
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.definitionId !== undefined) updateData.definitionId = input.definitionId;
      if (input.universe !== undefined) updateData.universe = input.universe;
      if (input.startChannel !== undefined) updateData.startChannel = input.startChannel;
      if (input.tags !== undefined) updateData.tags = input.tags;

      return prisma.fixtureInstance.update({
        where: { id },
        data: updateData,
        include: {
          definition: {
            include: {
              channels: true,
              modes: {
                include: {
                  modeChannels: {
                    include: {
                      channel: true,
                    },
                  },
                },
              },
            },
          },
          project: true,
        },
      });
    },

    deleteFixtureInstance: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      await prisma.fixtureInstance.delete({
        where: { id },
      });
      return true;
    },
  },

  types: {
    FixtureInstance: {
      channels: (parent: any, _: any, { prisma }: Context) => {
        return prisma.instanceChannel.findMany({
          where: { fixtureId: parent.id },
          orderBy: { offset: 'asc' },
        });
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
