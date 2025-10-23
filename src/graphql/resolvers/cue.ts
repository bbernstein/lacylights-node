import type { Context, WebSocketContext } from "../../context";
import { withFilter } from "graphql-subscriptions";
import { logger } from "../../utils/logger";
import { playbackService } from "../../services/playbackService";
import { getPlaybackStateService } from "../../services/playbackStateService";
import type { EasingType } from "../../types/enums";

// Input types for GraphQL mutations
export interface CreateCueListInput {
  name: string;
  description?: string;
  loop?: boolean;
  projectId: string;
}

export interface UpdateCueListInput {
  name?: string;
  description?: string;
  loop?: boolean;
}

export interface CreateCueInput {
  name: string;
  cueNumber: number;
  cueListId: string;
  sceneId: string;
  fadeInTime?: number;
  fadeOutTime?: number;
  followTime?: number;
  easingType?: EasingType;
  notes?: string;
}

export interface UpdateCueInput {
  name?: string;
  cueNumber?: number;
  sceneId?: string;
  fadeInTime?: number;
  fadeOutTime?: number;
  followTime?: number;
  easingType?: EasingType;
  notes?: string;
}

export interface CueOrder {
  cueId: string;
  cueNumber: number;
}

export interface BulkUpdateCuesInput {
  cueIds: string[];
  fadeInTime?: number;
  fadeOutTime?: number;
  followTime?: number;
  easingType?: EasingType;
}

export const cueResolvers = {
  Query: {
    cueListPlaybackStatus: async (
      _: unknown,
      { cueListId }: { cueListId: string },
    ) => {
      const playbackStateService = getPlaybackStateService();
      return playbackStateService.getFormattedStatus(cueListId);
    },

    cueLists: async (
      _: unknown,
      { projectId }: { projectId: string },
      { prisma }: Context,
    ) => {
      const cueLists = await prisma.cueList.findMany({
        where: { projectId },
        include: {
          cues: {
            select: {
              fadeInTime: true,
              fadeOutTime: true,
              followTime: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return cueLists.map((cueList) => {
        const cueCount = cueList.cues.length;
        // Calculate total duration as sum of all cue times
        const totalDuration = cueList.cues.reduce((sum, cue) => {
          const cueTime =
            cue.fadeInTime + cue.fadeOutTime + (cue.followTime || 0);
          return sum + cueTime;
        }, 0);

        return {
          id: cueList.id,
          name: cueList.name,
          description: cueList.description,
          cueCount,
          totalDuration,
          loop: cueList.loop,
          createdAt: cueList.createdAt.toISOString(),
        };
      });
    },

    cueList: async (
      _: unknown,
      {
        id,
        page = 1,
        perPage = 50,
        includeSceneDetails = false,
      }: {
        id: string;
        page?: number;
        perPage?: number;
        includeSceneDetails?: boolean;
      },
      { prisma }: Context,
    ) => {
      // Enforce max page size of 100
      const normalizedPerPage = Math.min(Math.max(1, perPage), 100);
      const normalizedPage = Math.max(1, page);
      const skip = (normalizedPage - 1) * normalizedPerPage;

      const cueList = await prisma.cueList.findUnique({
        where: { id },
        include: {
          project: true,
        },
      });

      if (!cueList) {
        return null;
      }

      // Get total count of cues
      const totalCues = await prisma.cue.count({
        where: { cueListId: id },
      });

      // Get paginated cues
      const cues = await prisma.cue.findMany({
        where: { cueListId: id },
        include: {
          scene: includeSceneDetails
            ? {
                include: {
                  fixtureValues: {
                    include: {
                      fixture: true,
                    },
                  },
                },
              }
            : true,
        },
        orderBy: {
          cueNumber: "asc",
        },
        skip,
        take: normalizedPerPage,
      });

      // Calculate total duration
      const allCues = await prisma.cue.findMany({
        where: { cueListId: id },
        select: {
          fadeInTime: true,
          fadeOutTime: true,
          followTime: true,
        },
      });

      const totalDuration = allCues.reduce((sum, cue) => {
        const cueTime =
          cue.fadeInTime + cue.fadeOutTime + (cue.followTime || 0);
        return sum + cueTime;
      }, 0);

      return {
        ...cueList,
        cues,
        cueCount: totalCues,
        totalDuration,
        _pagination: {
          total: totalCues,
          page: normalizedPage,
          perPage: normalizedPerPage,
        },
      };
    },

    cue: async (_: unknown, { id }: { id: string }, { prisma }: Context) => {
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
    createCueList: async (
      _: unknown,
      { input }: { input: CreateCueListInput },
      { prisma }: Context,
    ) => {
      return prisma.cueList.create({
        data: {
          name: input.name,
          description: input.description,
          loop: input.loop ?? false,
          projectId: input.projectId,
        },
        include: {
          project: true,
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

    updateCueList: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateCueListInput },
      { prisma }: Context,
    ) => {
      // Filter out undefined values to only update provided fields
      const updateData = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined),
      ) as { name?: string; description?: string; loop?: boolean };

      return prisma.cueList.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
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

    deleteCueList: async (
      _: unknown,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      await prisma.cueList.delete({
        where: { id },
      });
      return true;
    },

    createCue: async (
      _: unknown,
      { input }: { input: CreateCueInput },
      { prisma }: Context,
    ) => {
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

    updateCue: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateCueInput },
      { prisma }: Context,
    ) => {
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

    deleteCue: async (
      _: unknown,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
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
      _: unknown,
      { cueListId, cueOrders }: { cueListId: string; cueOrders: CueOrder[] },
      { prisma }: Context,
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
      const cueListCueIds = new Set(cueList.cues.map((cue) => cue.id));
      if (!cueOrders.every((cueOrder) => cueListCueIds.has(cueOrder.cueId))) {
        const invalidCue = cueOrders.find(
          (cueOrder) => !cueListCueIds.has(cueOrder.cueId),
        );
        throw new Error(
          `Cue with ID ${invalidCue!.cueId} does not belong to cue list ${cueListId}`,
        );
      }

      // Handle unique constraint by using a two-phase update approach
      await prisma.$transaction(async (tx) => {
        // Phase 1: Set all affected cues to temporary negative values to avoid conflicts
        await Promise.all(
          cueOrders.map((cueOrder, i) =>
            tx.cue.update({
              where: { id: cueOrder.cueId },
              data: { cueNumber: -(i + 1) }, // Use negative numbers as temporary values
            }),
          ),
        );

        // Phase 2: Set the final cue numbers
        await Promise.all(
          cueOrders.map(({ cueId, cueNumber }) =>
            tx.cue.update({
              where: { id: cueId },
              data: { cueNumber },
            }),
          ),
        );
      });

      // Invalidate cache since cue order changed
      playbackService.invalidateCache(cueListId);

      return true;
    },

    startCueList: async (
      _: unknown,
      { cueListId, startFromCue }: { cueListId: string; startFromCue?: number },
      { prisma }: Context,
    ) => {
      const playbackStateService = getPlaybackStateService();

      // Get the cue list with cues
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList || cueList.cues.length === 0) {
        throw new Error("Cue list not found or empty");
      }

      const startIndex = startFromCue !== undefined ? startFromCue : 0;
      if (startIndex < 0 || startIndex >= cueList.cues.length) {
        throw new Error("Invalid cue index");
      }

      await playbackStateService.startCue(
        cueListId,
        startIndex,
        cueList.cues[startIndex],
      );
      return true;
    },

    nextCue: async (
      _: unknown,
      { cueListId, fadeInTime }: { cueListId: string; fadeInTime?: number },
      { prisma, pubsub }: Context,
    ) => {
      const playbackStateService = getPlaybackStateService();
      const currentState = playbackStateService.getPlaybackState(cueListId);

      if (!currentState || currentState.currentCueIndex === null) {
        throw new Error("No active playback for this cue list");
      }

      // Get the cue list to check bounds and get next cue
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList) {
        throw new Error("Cue list not found");
      }

      let nextIndex = currentState.currentCueIndex + 1;

      // Handle loop logic
      if (nextIndex >= cueList.cues.length) {
        if (cueList.loop && cueList.cues.length > 0) {
          // Loop back to first cue
          nextIndex = 0;
        } else {
          throw new Error("Already at last cue");
        }
      }

      const nextCue = cueList.cues[nextIndex];

      // Use the existing playCue logic from dmx resolver
      // This will both send DMX output AND update the playback state
      const { dmxResolvers } = await import("./dmx");
      await dmxResolvers.Mutation.playCue(
        null,
        { cueId: nextCue.id, fadeInTime },
        { prisma, pubsub } as Context,
      );

      return true;
    },

    previousCue: async (
      _: unknown,
      { cueListId, fadeInTime }: { cueListId: string; fadeInTime?: number },
      { prisma, pubsub }: Context,
    ) => {
      const playbackStateService = getPlaybackStateService();
      const currentState = playbackStateService.getPlaybackState(cueListId);

      if (!currentState || currentState.currentCueIndex === null) {
        throw new Error("No active playback for this cue list");
      }

      const previousIndex = currentState.currentCueIndex - 1;

      if (previousIndex < 0) {
        throw new Error("Already at first cue");
      }

      // Get the cue list to get previous cue
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList) {
        throw new Error("Cue list not found");
      }

      const previousCue = cueList.cues[previousIndex];

      // Use the existing playCue logic from dmx resolver
      // This will both send DMX output AND update the playback state
      const { dmxResolvers } = await import("./dmx");
      await dmxResolvers.Mutation.playCue(
        null,
        { cueId: previousCue.id, fadeInTime },
        { prisma, pubsub } as Context,
      );

      return true;
    },

    goToCue: async (
      _: unknown,
      {
        cueListId,
        cueIndex,
        fadeInTime,
      }: { cueListId: string; cueIndex: number; fadeInTime?: number },
      { prisma, pubsub }: Context,
    ) => {
      // Get the cue list
      const cueList = await prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList || cueIndex < 0 || cueIndex >= cueList.cues.length) {
        throw new Error("Invalid cue index");
      }

      const targetCue = cueList.cues[cueIndex];

      // Use the existing playCue logic from dmx resolver
      // This will both send DMX output AND update the playback state
      const { dmxResolvers } = await import("./dmx");
      await dmxResolvers.Mutation.playCue(
        null,
        { cueId: targetCue.id, fadeInTime },
        { prisma, pubsub } as Context,
      );

      return true;
    },

    stopCueList: async (_: unknown, { cueListId }: { cueListId: string }) => {
      const playbackStateService = getPlaybackStateService();
      playbackStateService.stopCueList(cueListId);
      return true;
    },

    bulkUpdateCues: async (
      _: unknown,
      { input }: { input: BulkUpdateCuesInput },
      { prisma }: Context,
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
        const foundIds = new Set(existingCues.map((cue) => cue.id));
        const missingIds = input.cueIds.filter((id) => !foundIds.has(id));
        throw new Error(`Cues not found: ${missingIds.join(", ")}`);
      }

      // Build update data - only include fields that are provided
      const updateData: Partial<
        Pick<
          BulkUpdateCuesInput,
          "fadeInTime" | "fadeOutTime" | "followTime" | "easingType"
        >
      > = {};
      if (input.fadeInTime !== undefined) {
        updateData.fadeInTime = input.fadeInTime;
      }
      if (input.fadeOutTime !== undefined) {
        updateData.fadeOutTime = input.fadeOutTime;
      }
      if (input.followTime !== undefined) {
        updateData.followTime = input.followTime;
      }
      if (input.easingType !== undefined) {
        updateData.easingType = input.easingType;
      }

      if (Object.keys(updateData).length === 0) {
        throw new Error("No update fields provided");
      }

      // Perform bulk update using transaction for consistency
      const updatedCues = await prisma.$transaction(
        input.cueIds.map((cueId) =>
          prisma.cue.update({
            where: { id: cueId },
            data: updateData,
            include: {
              scene: true,
            },
          }),
        ),
      );

      // Invalidate cache for all affected cue lists
      const affectedCueListIds = new Set(
        existingCues.map((cue) => cue.cueListId),
      );
      for (const cueListId of affectedCueListIds) {
        playbackService.invalidateCache(cueListId);
      }

      return updatedCues;
    },
  },

  CueList: {
    cueCount: async (
      parent: { id: string; _pagination?: any },
      _: unknown,
      { prisma }: Context,
    ) => {
      // If we have pagination metadata from the query, use that total
      if (parent._pagination?.total !== undefined) {
        return parent._pagination.total;
      }
      // Otherwise count the cues
      return prisma.cue.count({
        where: { cueListId: parent.id },
      });
    },
    totalDuration: async (
      parent: { id: string; totalDuration?: number },
      _: unknown,
      { prisma }: Context,
    ) => {
      // If already calculated in the query, return it
      if (parent.totalDuration !== undefined) {
        return parent.totalDuration;
      }
      // Otherwise calculate it
      const cues = await prisma.cue.findMany({
        where: { cueListId: parent.id },
        select: {
          fadeInTime: true,
          fadeOutTime: true,
          followTime: true,
        },
      });
      return cues.reduce((sum, cue) => {
        const cueTime =
          cue.fadeInTime + cue.fadeOutTime + (cue.followTime || 0);
        return sum + cueTime;
      }, 0);
    },
  },

  Cue: {
    cueList: async (
      parent: { cueListId: string },
      _: unknown,
      { prisma }: Context,
    ) => {
      return prisma.cueList.findUnique({
        where: { id: parent.cueListId },
        include: {
          project: true,
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
  },

  CueListPlaybackStatus: {
    currentCue: async (parent: any, _: unknown, { prisma }: Context) => {
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

  Subscription: {
    cueListPlaybackUpdated: {
      subscribe: withFilter(
        (
          _: unknown,
          variables: { cueListId: string },
          { pubsub }: WebSocketContext,
        ) => {
          return pubsub.asyncIterator(["CUE_LIST_PLAYBACK_UPDATED"]);
        },
        (
          payload: { cueListPlaybackUpdated: { cueListId: string } },
          variables: { cueListId: string },
        ) => {
          // Input validation for subscription
          if (!variables.cueListId || typeof variables.cueListId !== "string") {
            logger.warn("Invalid cueListId in subscription filter", {
              cueListId: variables.cueListId,
            });
            return false;
          }

          return (
            payload.cueListPlaybackUpdated.cueListId === variables.cueListId
          );
        },
      ),
      resolve: (payload: any) => payload.cueListPlaybackUpdated,
    },
  },

  types: {},
};
