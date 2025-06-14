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
        },
        include: {
          definition: {
            include: {
              channels: true,
              modes: true,
            },
          },
          mode: true,
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
      if (input.modeId !== undefined) updateData.modeId = input.modeId;
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
              modes: true,
            },
          },
          mode: true,
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
      definition: (parent: any, _: any, { prisma }: Context) => {
        return prisma.fixtureDefinition.findUnique({
          where: { id: parent.definitionId },
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
