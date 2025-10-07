import { Context } from "../../context";
import { dmxService } from "../../services/dmx";
import { fadeEngine } from "../../services/fadeEngine";
import { parseChannelValues, serializeChannelValues } from "../../utils/db-helpers";

// Type definitions for fixture values
export interface FixtureValueInput {
  fixtureId: string;
  channelValues: number[];
  sceneOrder?: number | null;
}

// Type for existing fixture values from database
interface ExistingFixtureValue {
  id: string;
  fixtureId: string;
  sceneId: string;
  channelValues: number[];
  sceneOrder?: number | null;
}

// Helper function to handle fixture value updates/creates with optimized queries
async function upsertFixtureValues(
  prisma: Context["prisma"],
  sceneId: string,
  fixtureValues: FixtureValueInput[],
  overwrite: boolean = true,
) {
  // Fetch all existing fixture values for this scene and the given fixtureIds in one query
  const fixtureIds = fixtureValues.map((fv) => fv.fixtureId);
  const existingValues = await prisma.fixtureValue.findMany({
    where: {
      sceneId: sceneId,
      fixtureId: { in: fixtureIds },
    },
  });

  // Create a Map from fixtureId to existing fixtureValue for O(1) lookups
  // Parse channelValues from JSON string to number array
  const existingValueMap = new Map(
    existingValues.map((ev) => [
      ev.fixtureId,
      {
        ...ev,
        channelValues: parseChannelValues(ev.channelValues),
      } as ExistingFixtureValue,
    ]),
  );

  // Batch operations for better performance
  const updates: Promise<any>[] = [];
  const creates: any[] = [];

  for (const fv of fixtureValues) {
    const existingValue = existingValueMap.get(fv.fixtureId);

    if (existingValue) {
      if (overwrite) {
        // Add to update batch
        updates.push(
          prisma.fixtureValue.update({
            where: { id: existingValue.id },
            data: {
              channelValues: serializeChannelValues(fv.channelValues),
              sceneOrder: fv.sceneOrder,
            },
          }),
        );
      }
      // If not overwriting and fixture exists, skip it (safe behavior)
    } else {
      // Add to create batch
      creates.push({
        sceneId: sceneId,
        fixtureId: fv.fixtureId,
        channelValues: serializeChannelValues(fv.channelValues),
        sceneOrder: fv.sceneOrder,
      });
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    await Promise.all(updates);
  }

  // Batch create new values
  if (creates.length > 0) {
    await prisma.fixtureValue.createMany({
      data: creates,
    });
  }
}

export const sceneResolvers = {
  Query: {
    scene: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.scene.findUnique({
        where: { id },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: "asc" },
              { id: "asc" }, // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
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
              { sceneOrder: "asc" },
              { id: "asc" }, // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
                  },
                },
              },
            },
          },
        },
      });
    },

    updateScene: async (
      _: any,
      { id, input }: { id: string; input: any },
      { prisma }: Context,
    ) => {
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

      const updatedScene = await prisma.scene.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
          fixtureValues: {
            orderBy: [
              { sceneOrder: "asc" },
              { id: "asc" }, // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      // If this scene is currently active and fixture values were updated, apply the changes to DMX output
      if (input.fixtureValues) {
        // Check if this scene is currently active
        const currentActiveSceneId = dmxService.getCurrentActiveSceneId();
        const isCurrentlyActive = currentActiveSceneId === id;

        if (isCurrentlyActive) {
          // Build array of all channel values for the updated scene
          const sceneChannels: Array<{
            universe: number;
            channel: number;
            value: number;
          }> = [];

          for (const fixtureValue of updatedScene.fixtureValues) {
            const fixture = fixtureValue.fixture;
            const channelValues = parseChannelValues(fixtureValue.channelValues);

            // Iterate through channelValues array by index
            for (
              let channelIndex = 0;
              channelIndex < channelValues.length;
              channelIndex++
            ) {
              const value = channelValues[channelIndex];
              const dmxChannel = fixture.startChannel + channelIndex;

              sceneChannels.push({
                universe: fixture.universe,
                channel: dmxChannel,
                value: value,
              });
            }
          }

          // Apply the updated scene values immediately to DMX output
          // Use instant fade (0 seconds) since we want immediate live updates during editing
          fadeEngine.fadeToScene(sceneChannels, 0, `scene-${id}-update`);
        }
      }

      return updatedScene;
    },

    duplicateScene: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      // First, get the original scene with all its data
      const originalScene = await prisma.scene.findUnique({
        where: { id },
        include: {
          fixtureValues: true, // No need to include channelValues since it's now just an array
        },
      });

      if (!originalScene) {
        throw new Error("Scene not found");
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
              { sceneOrder: "asc" },
              { id: "asc" }, // Fallback for fixtures without scene order
            ],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
                  },
                },
              },
            },
          },
        },
      });
    },

    deleteScene: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      await prisma.scene.delete({
        where: { id },
      });
      return true;
    },

    // 🛡️ SAFE ADDITIVE SCENE UPDATES
    addFixturesToScene: async (
      _: any,
      {
        sceneId,
        fixtureValues,
        overwriteExisting,
      }: {
        sceneId: string;
        fixtureValues: FixtureValueInput[];
        overwriteExisting?: boolean;
      },
      { prisma }: Context,
    ) => {
      // Verify scene exists
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene with ID ${sceneId} not found`);
      }

      // Use optimized helper function to handle fixture updates
      await upsertFixtureValues(
        prisma,
        sceneId,
        fixtureValues,
        overwriteExisting,
      );

      // Return updated scene
      return prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
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
      { prisma }: Context,
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
            orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
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
        mergeFixtures = true,
      }: {
        sceneId: string;
        name?: string;
        description?: string;
        fixtureValues?: FixtureValueInput[];
        mergeFixtures?: boolean;
      },
      { prisma }: Context,
    ) => {
      // Build update data for scene metadata
      const updateData: Record<string, any> = {};

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
          // Safe merge behavior - use optimized helper function
          await upsertFixtureValues(prisma, sceneId, fixtureValues, true);
        } else {
          // Dangerous replace-all behavior (explicit opt-in)
          await prisma.fixtureValue.deleteMany({
            where: { sceneId: sceneId },
          });

          await prisma.fixtureValue.createMany({
            data: fixtureValues.map((fv) => ({
              sceneId: sceneId,
              fixtureId: fv.fixtureId,
              channelValues: serializeChannelValues(fv.channelValues),
              sceneOrder: fv.sceneOrder,
            })),
          });
        }
      }

      // Get the updated scene
      const updatedScene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: true,
          fixtureValues: {
            orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
            include: {
              fixture: {
                include: {
                  channels: {
                    orderBy: { offset: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      // If this scene is currently active and fixture values were updated, apply the changes to DMX output
      if (
        fixtureValues &&
        fixtureValues.length > 0 &&
        dmxService.getCurrentActiveSceneId() === sceneId &&
        updatedScene
      ) {
        // Build array of all channel values for the updated scene
        const sceneChannels: Array<{
          universe: number;
          channel: number;
          value: number;
        }> = [];

        for (const fixtureValue of updatedScene.fixtureValues) {
          const fixture = fixtureValue.fixture;
          const channelValues = parseChannelValues(fixtureValue.channelValues);

          // Iterate through channelValues array by index
          for (
            let channelIndex = 0;
            channelIndex < channelValues.length;
            channelIndex++
          ) {
            const value = channelValues[channelIndex];
            const dmxChannel = fixture.startChannel + channelIndex;

            sceneChannels.push({
              universe: fixture.universe,
              channel: dmxChannel,
              value,
            });
          }
        }

        // Apply the updated scene values immediately to DMX output
        // Use instant fade (0 seconds) since we want immediate live updates during editing
        fadeEngine.fadeToScene(
          sceneChannels,
          0,
          `scene-${sceneId}-partial-update`,
        );
      }

      return updatedScene;
    },
  },

  types: {},
};
