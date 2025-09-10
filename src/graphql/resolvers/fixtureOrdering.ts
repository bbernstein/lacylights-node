import { Context } from '../../context';

export const fixtureOrderingResolvers = {
  Mutation: {
    reorderProjectFixtures: async (
      _: unknown,
      { fixtureOrders }: { fixtureOrders: Array<{ fixtureId: string; order: number }> },
      { prisma }: Context
    ) => {
      try {
        // Update each fixture's projectOrder
        const updatePromises = fixtureOrders.map(({ fixtureId, order }) =>
          prisma.fixtureInstance.update({
            where: { id: fixtureId },
            data: { projectOrder: order },
          })
        );

        await Promise.all(updatePromises);
        return true;
      } catch {
        throw new Error('Failed to reorder project fixtures');
      }
    },

    reorderSceneFixtures: async (
      _: unknown,
      { sceneId, fixtureOrders }: { sceneId: string; fixtureOrders: Array<{ fixtureId: string; order: number }> },
      { prisma }: Context
    ) => {
      try {
        // Update each fixture value's sceneOrder
        const updatePromises = fixtureOrders.map(({ fixtureId, order }) =>
          prisma.fixtureValue.updateMany({
            where: { 
              sceneId: sceneId,
              fixtureId: fixtureId 
            },
            data: { sceneOrder: order },
          })
        );

        await Promise.all(updatePromises);
        return true;
      } catch {
        throw new Error('Failed to reorder scene fixtures');
      }
    },
  },
};