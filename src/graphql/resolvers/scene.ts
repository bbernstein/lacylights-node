import { Context } from '../../context';

export const sceneResolvers = {
  Query: {
    scene: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.scene.findUnique({
        where: { id },
        include: {
          project: true,
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
  },

  Mutation: {
    createScene: async (_: any, { input }: any, { prisma }: Context) => {
      return prisma.scene.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          fixtureValues: {
            create: input.fixtureValues.map((fv: any) => ({
              fixtureId: fv.fixtureId,
              channelValues: {
                create: fv.channelValues.map((cv: any) => ({
                  channelId: cv.channelId,
                  value: cv.value,
                })),
              },
            })),
          },
        },
        include: {
          project: true,
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

    updateScene: async (_: any, { id, input }: { id: string; input: any }, { prisma }: Context) => {
      // Build update data object dynamically based on what's provided
      const updateData: any = {};
      
      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      
      if (input.description !== undefined) {
        updateData.description = input.description;
      }
      
      // If fixtureValues are provided, we need to replace all existing values
      if (input.fixtureValues) {
        // First, delete all existing fixture values for this scene
        await prisma.fixtureValue.deleteMany({
          where: { sceneId: id },
        });
        
        // Then create new fixture values
        updateData.fixtureValues = {
          create: input.fixtureValues.map((fv: any) => ({
            fixtureId: fv.fixtureId,
            channelValues: {
              create: fv.channelValues.map((cv: any) => ({
                channelId: cv.channelId,
                value: cv.value,
              })),
            },
          })),
        };
      }
      
      return prisma.scene.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
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

    duplicateScene: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      // First, get the original scene with all its data
      const originalScene = await prisma.scene.findUnique({
        where: { id },
        include: {
          fixtureValues: {
            include: {
              channelValues: true,
            },
          },
        },
      });

      if (!originalScene) {
        throw new Error('Scene not found');
      }

      // Create the duplicate scene
      return prisma.scene.create({
        data: {
          name: `${originalScene.name} (Copy)`,
          description: originalScene.description,
          projectId: originalScene.projectId,
          fixtureValues: {
            create: originalScene.fixtureValues.map((fv) => ({
              fixtureId: fv.fixtureId,
              channelValues: {
                create: fv.channelValues.map((cv) => ({
                  channelId: cv.channelId,
                  value: cv.value,
                })),
              },
            })),
          },
        },
        include: {
          project: true,
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

    deleteScene: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      await prisma.scene.delete({
        where: { id },
      });
      return true;
    },
  },

  types: {},
};
