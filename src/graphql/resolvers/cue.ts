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

    reorderCues: async (
      _: any,
      { cueListId, cueOrders }: { cueListId: string; cueOrders: Array<{ cueId: string; cueNumber: number }> },
      { prisma }: Context
    ) => {
      // Verify the cue list exists
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: { cues: true },
      });

      if (!cueList) {
        throw new Error(`Cue list with ID ${cueListId} not found`);
      }

      // Verify all cue IDs belong to this cue list
      const cueListCueIds = new Set(cueList.cues.map(cue => cue.id));
      if (!cueOrders.every(cueOrder => cueListCueIds.has(cueOrder.cueId))) {
        const invalidCue = cueOrders.find(cueOrder => !cueListCueIds.has(cueOrder.cueId));
        throw new Error(`Cue with ID ${invalidCue!.cueId} does not belong to cue list ${cueListId}`);
      }

      // Handle unique constraint by using a two-phase update approach
      await prisma.$transaction(async (tx) => {
        // Phase 1: Set all affected cues to temporary negative values to avoid conflicts
        await Promise.all(
          cueOrders.map((cueOrder, i) =>
            tx.cue.update({
              where: { id: cueOrder.cueId },
              data: { cueNumber: -(i + 1) }, // Use negative numbers as temporary values
            })
          )
        );

        // Phase 2: Set the final cue numbers
        await Promise.all(
          cueOrders.map(({ cueId, cueNumber }) =>
            tx.cue.update({
              where: { id: cueId },
              data: { cueNumber },
            })
          )
        );
      });

      return true;
    },

    bulkUpdateCues: async (
      _: any,
      { input }: { input: { cueIds: string[]; fadeInTime?: number; fadeOutTime?: number; followTime?: number; easingType?: string } },
      { prisma }: Context
    ) => {
      // Verify all cues exist first
      const existingCues = await prisma.cue.findMany({
        where: {
          id: {
            in: input.cueIds,
          },
        },
        include: {
          scene: true,
        },
      });

      if (existingCues.length !== input.cueIds.length) {
        const foundIds = new Set(existingCues.map(cue => cue.id));
        const missingIds = input.cueIds.filter(id => !foundIds.has(id));
        throw new Error(`Cues not found: ${missingIds.join(', ')}`);
      }

      // Build update data - only include fields that are provided
      const updateData: any = {};
      if (input.fadeInTime !== undefined) {updateData.fadeInTime = input.fadeInTime;}
      if (input.fadeOutTime !== undefined) {updateData.fadeOutTime = input.fadeOutTime;}
      if (input.followTime !== undefined) {updateData.followTime = input.followTime;}
      if (input.easingType !== undefined) {updateData.easingType = input.easingType;}

      if (Object.keys(updateData).length === 0) {
        throw new Error('No update fields provided');
      }

      // Perform bulk update using transaction for consistency
      const updatedCues = await prisma.$transaction(
        input.cueIds.map(cueId =>
          prisma.cue.update({
            where: { id: cueId },
            data: updateData,
            include: {
              scene: true,
            },
          })
        )
      );

      return updatedCues;
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
