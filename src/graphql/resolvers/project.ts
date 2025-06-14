import { Context } from '../../context';

export const projectResolvers = {
  Query: {
    projects: async (_: any, __: any, { prisma }: Context) => {
      return prisma.project.findMany({
        include: {
          fixtures: true,
          scenes: true,
          cueLists: true,
          users: {
            include: {
              user: true,
            },
          },
        },
      });
    },

    project: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.project.findUnique({
        where: { id },
        include: {
          fixtures: true,
          scenes: true,
          cueLists: true,
          users: {
            include: {
              user: true,
            },
          },
        },
      });
    },
  },
  Mutation: {
    createProject: async (_: any, { input }: any, { prisma }: Context) => {
      return prisma.project.create({
        data: {
          name: input.name,
          description: input.description,
        },
        include: {
          fixtures: true,
          scenes: true,
          cueLists: true,
          users: {
            include: {
              user: true,
            },
          },
        },
      });
    },

    updateProject: async (_: any, { id, input }: any, { prisma }: Context) => {
      return prisma.project.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
        },
        include: {
          fixtures: true,
          scenes: true,
          cueLists: true,
          users: {
            include: {
              user: true,
            },
          },
        },
      });
    },

    deleteProject: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      await prisma.project.delete({ where: { id } });
      return true;
    },
  },
  Subscription: {
    projectUpdated: {
      // TODO: Implement subscription logic
      subscribe: () => {
        // Placeholder - will be implemented with GraphQL subscriptions
      },
    },
  },

  types: {
    Project: {
      fixtures: (parent: any, _: any, { prisma }: Context) => {
        return prisma.fixtureInstance.findMany({
          where: { projectId: parent.id },
          include: {
            definition: {
              include: {
                modes: true,
              },
            },
            mode: true,
          },
        });
      },
      scenes: (parent: any, _: any, { prisma }: Context) => {
        return prisma.scene.findMany({
          where: { projectId: parent.id },
          include: {
            fixtureValues: {
              include: {
                fixture: true,
                channelValues: {
                  include: {
                    channel: true,
                  },
                },
              },
            },
          },
        });
      },
      cueLists: (parent: any, _: any, { prisma }: Context) => {
        return prisma.cueList.findMany({
          where: { projectId: parent.id },
          include: {
            cues: {
              include: {
                scene: true,
              },
              orderBy: {
                cueNumber: 'asc',
              },
            },
          },
        });
      },
    },
  },
};
