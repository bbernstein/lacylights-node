import { Context } from '../../context';

export const cueResolvers = {
  Query: {
    cueList: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.cueList.findUnique({
        where: { id },
        include: {
          project: true,
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

    cue: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.cue.findUnique({
        where: { id },
        include: {
          scene: true,
          cueList: true,
        },
      });
    },
  },

  Mutation: {
    createCueList: async (_: any, { input }: any, { prisma }: Context) => {
      return prisma.cueList.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
        },
        include: {
          project: true,
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

    updateCueList: async (_: any, { id, input }: { id: string; input: any }, { prisma }: Context) => {
      return prisma.cueList.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
        },
        include: {
          project: true,
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

    deleteCueList: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      await prisma.cueList.delete({
        where: { id },
      });
      return true;
    },

    createCue: async (_: any, { input }: any, { prisma }: Context) => {
      return prisma.cue.create({
        data: {
          name: input.name,
          cueNumber: input.cueNumber,
          cueListId: input.cueListId,
          sceneId: input.sceneId,
          fadeInTime: input.fadeInTime,
          fadeOutTime: input.fadeOutTime,
          followTime: input.followTime,
          easingType: input.easingType,
          notes: input.notes,
        },
        include: {
          scene: true,
        },
      });
    },

    updateCue: async (_: any, { id, input }: { id: string; input: any }, { prisma }: Context) => {
      return prisma.cue.update({
        where: { id },
        data: {
          name: input.name,
          cueNumber: input.cueNumber,
          sceneId: input.sceneId,
          fadeInTime: input.fadeInTime,
          fadeOutTime: input.fadeOutTime,
          followTime: input.followTime,
          easingType: input.easingType,
          notes: input.notes,
        },
        include: {
          scene: true,
        },
      });
    },

    deleteCue: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      await prisma.cue.delete({
        where: { id },
      });
      return true;
    },
  },

  Cue: {
    cueList: async (parent: any, _: any, { prisma }: Context) => {
      return prisma.cueList.findUnique({
        where: { id: parent.cueListId },
        include: {
          project: true,
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

  types: {},
};
