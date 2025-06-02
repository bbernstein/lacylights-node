import { Context } from '../../context';

export const sceneResolvers = {
  Query: {
    // TODO: Add scene queries
  },

  Mutation: {
    createScene: async (_: any, { input }: any, { prisma }: Context) => {
      // TODO: Implement scene creation with fixture values
      return prisma.scene.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
        },
      });
    },
  },

  types: {},
};
