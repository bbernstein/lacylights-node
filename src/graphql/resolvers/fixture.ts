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
          definitionId: input.definitionId,
          projectId: input.projectId,
          universe: input.universe,
          startChannel: input.startChannel,
          tags: input.tags,
        },
        include: {
          definition: {
            include: {
              channels: true,
            },
          },
          project: true,
        },
      });
    },

    // TODO: Add update and delete mutations
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
