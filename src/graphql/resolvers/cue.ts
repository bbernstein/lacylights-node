import { Context } from '../../context';
import { withFilter } from 'graphql-subscriptions';
import { getPlaybackStateService } from '../../services/playbackStateService';

export const cueResolvers = {
  Query: {
    cueListPlaybackStatus: async (_: any, { cueListId }: { cueListId: string }) => {
      const playbackService = getPlaybackStateService();
      return playbackService.getFormattedStatus(cueListId);
    },

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

    startCueList: async (_: any, { cueListId, startFromCue }: { cueListId: string; startFromCue?: number }, { prisma }: Context) => {
      const playbackService = getPlaybackStateService();

      // Get the cue list with cues
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: 'asc' }
          }
        }
      });

      if (!cueList || cueList.cues.length === 0) {
        throw new Error('Cue list not found or empty');
      }

      const startIndex = startFromCue !== undefined ? startFromCue : 0;
      if (startIndex < 0 || startIndex >= cueList.cues.length) {
        throw new Error('Invalid cue index');
      }

      await playbackService.startCue(cueListId, startIndex, cueList.cues[startIndex]);
      return true;
    },

    nextCue: async (_: any, { cueListId, fadeInTime }: { cueListId: string; fadeInTime?: number }, { prisma, pubsub }: Context) => {
      const playbackService = getPlaybackStateService();
      const currentState = playbackService.getPlaybackState(cueListId);

      if (!currentState || currentState.currentCueIndex === null) {
        throw new Error('No active playback for this cue list');
      }

      const nextIndex = currentState.currentCueIndex + 1;

      // Get the cue list to check bounds and get next cue
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: 'asc' }
          }
        }
      });

      if (!cueList || nextIndex >= cueList.cues.length) {
        throw new Error('Already at last cue');
      }

      const nextCue = cueList.cues[nextIndex];

      // Use the existing playCue logic from dmx resolver
      const { dmxResolvers } = await import('./dmx');
      await dmxResolvers.Mutation.playCue(null, { cueId: nextCue.id, fadeInTime }, { prisma, pubsub } as Context);

      return true;
    },

    previousCue: async (_: any, { cueListId, fadeInTime }: { cueListId: string; fadeInTime?: number }, { prisma, pubsub }: Context) => {
      const playbackService = getPlaybackStateService();
      const currentState = playbackService.getPlaybackState(cueListId);

      if (!currentState || currentState.currentCueIndex === null) {
        throw new Error('No active playback for this cue list');
      }

      const previousIndex = currentState.currentCueIndex - 1;

      if (previousIndex < 0) {
        throw new Error('Already at first cue');
      }

      // Get the cue list to get previous cue
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: 'asc' }
          }
        }
      });

      if (!cueList) {
        throw new Error('Cue list not found');
      }

      const previousCue = cueList.cues[previousIndex];

      // Use the existing playCue logic from dmx resolver
      const { dmxResolvers } = await import('./dmx');
      await dmxResolvers.Mutation.playCue(null, { cueId: previousCue.id, fadeInTime }, { prisma, pubsub } as Context);

      return true;
    },

    goToCue: async (_: any, { cueListId, cueIndex, fadeInTime }: { cueListId: string; cueIndex: number; fadeInTime?: number }, { prisma, pubsub }: Context) => {

      // Get the cue list
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: 'asc' }
          }
        }
      });

      if (!cueList || cueIndex < 0 || cueIndex >= cueList.cues.length) {
        throw new Error('Invalid cue index');
      }

      const targetCue = cueList.cues[cueIndex];

      // Use the existing playCue logic from dmx resolver
      const { dmxResolvers } = await import('./dmx');
      await dmxResolvers.Mutation.playCue(null, { cueId: targetCue.id, fadeInTime }, { prisma, pubsub } as Context);

      return true;
    },

    stopCueList: async (_: any, { cueListId }: { cueListId: string }) => {
      const playbackService = getPlaybackStateService();
      playbackService.stopCueList(cueListId);
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

  Subscription: {
    cueListPlaybackUpdated: {
      subscribe: withFilter(
        (_: any, variables: { cueListId: string }, { pubsub }: Context) => {
          return pubsub.asyncIterator([`CUE_LIST_PLAYBACK_UPDATED_${variables.cueListId}`]);
        },
        (payload: any, variables: { cueListId: string }) => {
          return payload.cueListPlaybackUpdated.cueListId === variables.cueListId;
        }
      ),
      resolve: (payload: any) => payload.cueListPlaybackUpdated,
    },
  },

  CueListPlaybackStatus: {
    currentCue: async (parent: any, _: any, { prisma }: Context) => {
      if (!parent.currentCue || !parent.currentCue.id) {
        return null;
      }

      return prisma.cue.findUnique({
        where: { id: parent.currentCue.id },
        include: {
          scene: true,
          cueList: true,
        },
      });
    },
  },

  types: {},
};
