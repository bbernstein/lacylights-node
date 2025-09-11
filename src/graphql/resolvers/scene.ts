import { Context } from '../../context';

export const sceneResolvers = {
  Query: {
    scene: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.scene.findUnique({
        where: { id },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' } // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
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
              channelValues: fv.channelValues, // Now just a simple array of integers
              sceneOrder: fv.sceneOrder,
            })),
          },
        },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' } // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
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
            channelValues: fv.channelValues, // Now just a simple array of integers
            sceneOrder: fv.sceneOrder,
          })),
        };
      }
      
      return prisma.scene.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' } // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
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
          fixtureValues: true, // No need to include channelValues since it's now just an array
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
              channelValues: fv.channelValues, // Now just a simple array copy
              sceneOrder: fv.sceneOrder,
            })),
          },
        },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' } // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
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

    // 🛡️ SAFE ADDITIVE SCENE UPDATES
    addFixturesToScene: async (
      _: any, 
      { sceneId, fixtureValues, overwriteExisting }: { 
        sceneId: string; 
        fixtureValues: any[];
        overwriteExisting?: boolean;
      }, 
      { prisma }: Context
    ) => {
      // Verify scene exists
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene with ID ${sceneId} not found`);
      }

      // For each fixture value provided
      for (const fv of fixtureValues) {
        const existingValue = await prisma.fixtureValue.findFirst({
          where: {
            sceneId: sceneId,
            fixtureId: fv.fixtureId,
          },
        });

        if (existingValue) {
          if (overwriteExisting) {
            // Update existing fixture value
            await prisma.fixtureValue.update({
              where: { id: existingValue.id },
              data: {
                channelValues: fv.channelValues,
                sceneOrder: fv.sceneOrder,
              },
            });
          }
          // If not overwriting and fixture exists, skip it (safe behavior)
        } else {
          // Create new fixture value
          await prisma.fixtureValue.create({
            data: {
              sceneId: sceneId,
              fixtureId: fv.fixtureId,
              channelValues: fv.channelValues,
              sceneOrder: fv.sceneOrder,
            },
          });
        }
      }

      // Return updated scene
      return prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' },
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
                },
              },
            },
          },
        },
      });
    },

    removeFixturesFromScene: async (
      _: any,
      { sceneId, fixtureIds }: { sceneId: string; fixtureIds: string[] },
      { prisma }: Context
    ) => {
      // Verify scene exists
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene with ID ${sceneId} not found`);
      }

      // Remove specified fixtures from the scene
      await prisma.fixtureValue.deleteMany({
        where: {
          sceneId: sceneId,
          fixtureId: {
            in: fixtureIds,
          },
        },
      });

      // Return updated scene
      return prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' },
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
                },
              },
            },
          },
        },
      });
    },

    updateScenePartial: async (
      _: any,
      { 
        sceneId, 
        name, 
        description, 
        fixtureValues, 
        mergeFixtures = true 
      }: { 
        sceneId: string;
        name?: string;
        description?: string;
        fixtureValues?: any[];
        mergeFixtures?: boolean;
      },
      { prisma }: Context
    ) => {
      // Build update data for scene metadata
      const updateData: any = {};
      
      if (name !== undefined) {
        updateData.name = name;
      }
      
      if (description !== undefined) {
        updateData.description = description;
      }

      // Update scene metadata if provided
      if (Object.keys(updateData).length > 0) {
        await prisma.scene.update({
          where: { id: sceneId },
          data: updateData,
        });
      }

      // Handle fixture values if provided
      if (fixtureValues && fixtureValues.length > 0) {
        if (mergeFixtures) {
          // Safe merge behavior - use addFixturesToScene logic
          for (const fv of fixtureValues) {
            const existingValue = await prisma.fixtureValue.findFirst({
              where: {
                sceneId: sceneId,
                fixtureId: fv.fixtureId,
              },
            });

            if (existingValue) {
              // Update existing fixture value
              await prisma.fixtureValue.update({
                where: { id: existingValue.id },
                data: {
                  channelValues: fv.channelValues,
                  sceneOrder: fv.sceneOrder,
                },
              });
            } else {
              // Create new fixture value
              await prisma.fixtureValue.create({
                data: {
                  sceneId: sceneId,
                  fixtureId: fv.fixtureId,
                  channelValues: fv.channelValues,
                  sceneOrder: fv.sceneOrder,
                },
              });
            }
          }
        } else {
          // Dangerous replace-all behavior (explicit opt-in)
          await prisma.fixtureValue.deleteMany({
            where: { sceneId: sceneId },
          });
          
          await prisma.fixtureValue.createMany({
            data: fixtureValues.map((fv: any) => ({
              sceneId: sceneId,
              fixtureId: fv.fixtureId,
              channelValues: fv.channelValues,
              sceneOrder: fv.sceneOrder,
            })),
          });
        }
      }

      // Return updated scene
      return prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: 'asc' },
              { id: 'asc' },
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: 'asc' },
                  },
                },
              },
            },
          },
        },
      });
    },
  },

  types: {},
};
