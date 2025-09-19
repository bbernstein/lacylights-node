import type { Context, WebSocketContext } from '../../context';
import { withFilter } from 'graphql-subscriptions';
import { logger } from '../../utils/logger';
import { playbackService } from '../../services/playbackService';

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

    cueListPlaybackStatus: async (_: any, { cueListId }: { cueListId: string }) => {
      return playbackService.getPlaybackStatus(cueListId);
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
      const newCue = await prisma.cue.create({
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

      // Invalidate cache since cue list structure changed
      playbackService.invalidateCache(input.cueListId);

      return newCue;
    },

    updateCue: async (_: any, { id, input }: { id: string; input: any }, { prisma }: Context) => {
      // First get the cue to find its cueListId
      const existingCue = await prisma.cue.findUnique({
        where: { id },
        select: { cueListId: true },
      });

      if (!existingCue) {
        throw new Error(`Cue with ID ${id} not found`);
      }

      const updatedCue = await prisma.cue.update({
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

      // Invalidate cache since cue properties changed
      playbackService.invalidateCache(existingCue.cueListId);

      return updatedCue;
    },

    deleteCue: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      // First get the cue to find its cueListId
      const existingCue = await prisma.cue.findUnique({
        where: { id },
        select: { cueListId: true },
      });

      if (!existingCue) {
        throw new Error(`Cue with ID ${id} not found`);
      }

      await prisma.cue.delete({
        where: { id },
      });

      // Invalidate cache since cue list structure changed
      playbackService.invalidateCache(existingCue.cueListId);

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

      // Invalidate cache since cue order changed
      playbackService.invalidateCache(cueListId);

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

      // Invalidate cache for all affected cue lists
      const affectedCueListIds = new Set(existingCues.map(cue => cue.cueListId));
      for (const cueListId of affectedCueListIds) {
        playbackService.invalidateCache(cueListId);
      }

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

  Subscription: {
    cueListPlaybackUpdated: {
      subscribe: withFilter(
        (_: any, __: any, { pubsub }: WebSocketContext) => {
          return pubsub.asyncIterator(['CUE_LIST_PLAYBACK_UPDATED']);
        },
        (payload: any, variables: { cueListId: string }) => {
          // Input validation for subscription
          if (!variables.cueListId || typeof variables.cueListId !== 'string') {
            logger.warn('Invalid cueListId in subscription filter', { cueListId: variables.cueListId });
            return false;
          }

          return payload.cueListPlaybackUpdated.cueListId === variables.cueListId;
        }
      ),
    },
  },

  types: {},
};
