import { Context, WebSocketContext } from "../../context";

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

    deleteProject: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      await prisma.project.delete({ where: { id } });
      return true;
    },
  },
  Subscription: {
    projectUpdated: {
      // Note: projectId parameter is defined in the schema but not used for filtering here.
      // Filtering happens at the resolver level when the PROJECT_UPDATED event is published.
      // This follows the same pattern as other subscriptions (previewSessionUpdated, dmxOutputChanged).
      subscribe: (
        _: unknown,
        { projectId: _projectId }: { projectId: string },
        { pubsub }: WebSocketContext,
      ) => {
        return pubsub.asyncIterator(["PROJECT_UPDATED"]);
      },
    },
  },

  types: {
    Project: {
      fixtures: (parent: any, _: any, { prisma }: Context) => {
        return prisma.fixtureInstance.findMany({
          where: { projectId: parent.id },
          orderBy: [
            { projectOrder: "asc" },
            { createdAt: "asc" }, // Fallback for fixtures without order
          ],
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
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
                cueNumber: "asc",
              },
            },
          },
        });
      },
      fixtureCount: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.fixtureInstance.count({
          where: { projectId: parent.id },
        });
      },
      sceneCount: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.scene.count({
          where: { projectId: parent.id },
        });
      },
      cueListCount: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.cueList.count({
          where: { projectId: parent.id },
        });
      },
    },
  },
};
