import { Context } from "../../context";
import { dmxService } from "../../services/dmx";
import { fadeEngine } from "../../services/fadeEngine";
import { EasingType } from "../../services/fadeEngine";

// Type definitions for input types
export interface CreateSceneBoardInput {
  name: string;
  description?: string;
  projectId: string;
  defaultFadeTime?: number;
  gridSize?: number;
}

export interface UpdateSceneBoardInput {
  name?: string;
  description?: string;
  defaultFadeTime?: number;
  gridSize?: number;
}

export interface CreateSceneBoardButtonInput {
  sceneBoardId: string;
  sceneId: string;
  layoutX: number;
  layoutY: number;
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}

export interface UpdateSceneBoardButtonInput {
  layoutX?: number;
  layoutY?: number;
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}

export interface SceneBoardButtonPositionInput {
  buttonId: string;
  layoutX: number;
  layoutY: number;
}

export const sceneBoardResolvers = {
  Query: {
    sceneBoards: async (
      _: any,
      { projectId }: { projectId: string },
      { prisma }: Context,
    ) => {
      return prisma.sceneBoard.findMany({
        where: { projectId },
        include: {
          buttons: {
            include: {
              scene: true,
            },
          },
          project: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    },

    sceneBoard: async (_: any, { id }: { id: string }, { prisma }: Context) => {
      return prisma.sceneBoard.findUnique({
        where: { id },
        include: {
          buttons: {
            include: {
              scene: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          project: true,
        },
      });
    },

    sceneBoardButton: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      return prisma.sceneBoardButton.findUnique({
        where: { id },
        include: {
          sceneBoard: true,
          scene: true,
        },
      });
    },
  },

  Mutation: {
    createSceneBoard: async (
      _: any,
      { input }: { input: CreateSceneBoardInput },
      { prisma }: Context,
    ) => {
      return prisma.sceneBoard.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          defaultFadeTime: input.defaultFadeTime ?? 3.0,
          gridSize: input.gridSize ?? 50,
        },
        include: {
          buttons: {
            include: {
              scene: true,
            },
          },
          project: true,
        },
      });
    },

    updateSceneBoard: async (
      _: any,
      { id, input }: { id: string; input: UpdateSceneBoardInput },
      { prisma }: Context,
    ) => {
      return prisma.sceneBoard.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.defaultFadeTime !== undefined && {
            defaultFadeTime: input.defaultFadeTime,
          }),
          ...(input.gridSize !== undefined && { gridSize: input.gridSize }),
        },
        include: {
          buttons: {
            include: {
              scene: true,
            },
          },
          project: true,
        },
      });
    },

    deleteSceneBoard: async (
      _: any,
      { id }: { id: string },
      { prisma }: Context,
    ) => {
      await prisma.sceneBoard.delete({ where: { id } });
      return true;
    },

    addSceneToBoard: async (
      _: any,
      { input }: { input: CreateSceneBoardButtonInput },
      { prisma }: Context,
    ) => {
      // Check if scene already exists on this board
      const existing = await prisma.sceneBoardButton.findFirst({
        where: {
          sceneBoardId: input.sceneBoardId,
          sceneId: input.sceneId,
        },
      });

      if (existing) {
        throw new Error("Scene already exists on this board");
      }

      return prisma.sceneBoardButton.create({
        data: {
          sceneBoardId: input.sceneBoardId,
          sceneId: input.sceneId,
          layoutX: input.layoutX,
          layoutY: input.layoutY,
          width: input.width ?? 0.1,
          height: input.height ?? 0.1,
          color: input.color,
          label: input.label,
        },
        include: {
          sceneBoard: true,
          scene: true,
        },
      });
    },

    updateSceneBoardButton: async (
      _: any,
      { id, input }: { id: string; input: UpdateSceneBoardButtonInput },
      { prisma }: Context,
    ) => {
      return prisma.sceneBoardButton.update({
        where: { id },
        data: {
          ...(input.layoutX !== undefined && { layoutX: input.layoutX }),
          ...(input.layoutY !== undefined && { layoutY: input.layoutY }),
          ...(input.width !== undefined && { width: input.width }),
          ...(input.height !== undefined && { height: input.height }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.label !== undefined && { label: input.label }),
        },
        include: {
          sceneBoard: true,
          scene: true,
        },
      });
    },

    removeSceneFromBoard: async (
      _: any,
      { buttonId }: { buttonId: string },
      { prisma }: Context,
    ) => {
      await prisma.sceneBoardButton.delete({ where: { id: buttonId } });
      return true;
    },

    updateSceneBoardButtonPositions: async (
      _: any,
      { positions }: { positions: SceneBoardButtonPositionInput[] },
      { prisma }: Context,
    ) => {
      // Batch update all button positions
      const updates = positions.map((pos) =>
        prisma.sceneBoardButton.update({
          where: { id: pos.buttonId },
          data: {
            layoutX: pos.layoutX,
            layoutY: pos.layoutY,
          },
        }),
      );

      await Promise.all(updates);
      return true;
    },

    activateSceneFromBoard: async (
      _: any,
      {
        sceneBoardId,
        sceneId,
        fadeTimeOverride,
      }: { sceneBoardId: string; sceneId: string; fadeTimeOverride?: number },
      { prisma }: Context,
    ) => {
      // Fetch the scene board to get default fade time
      const sceneBoard = await prisma.sceneBoard.findUnique({
        where: { id: sceneBoardId },
      });

      if (!sceneBoard) {
        throw new Error("Scene board not found");
      }

      // Fetch the scene with all fixture values
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          fixtureValues: {
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

      if (!scene) {
        throw new Error("Scene not found");
      }

      // Use fade time override if provided, otherwise use board's default
      const fadeTime = fadeTimeOverride ?? sceneBoard.defaultFadeTime;

      // Collect all channels that need to fade
      const channelsToFade: Array<{
        universe: number;
        channel: number;
        targetValue: number;
      }> = [];

      // Apply the scene with fade
      for (const fv of scene.fixtureValues) {
        const fixture = fv.fixture;
        const channelValues =
          typeof fv.channelValues === "string"
            ? JSON.parse(fv.channelValues)
            : fv.channelValues;

        // Add each channel to fade list
        for (let i = 0; i < channelValues.length; i++) {
          channelsToFade.push({
            universe: fixture.universe,
            channel: fixture.startChannel + i,
            targetValue: channelValues[i],
          });
        }
      }

      // Start the fade (converts seconds to milliseconds)
      fadeEngine.fadeChannels(
        channelsToFade,
        fadeTime * 1000,
        undefined,
        undefined,
        EasingType.LINEAR,
      );

      // Update active scene tracking
      dmxService.setActiveScene(sceneId);

      return true;
    },
  },

  types: {
    SceneBoard: {
      buttons: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.sceneBoardButton.findMany({
          where: { sceneBoardId: parent.id },
          include: {
            scene: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      },
      project: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.project.findUnique({
          where: { id: parent.projectId },
        });
      },
    },
    SceneBoardButton: {
      sceneBoard: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.sceneBoard.findUnique({
          where: { id: parent.sceneBoardId },
        });
      },
      scene: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.scene.findUnique({
          where: { id: parent.sceneId },
        });
      },
    },
    Project: {
      sceneBoards: async (parent: any, _: any, { prisma }: Context) => {
        return prisma.sceneBoard.findMany({
          where: { projectId: parent.id },
          include: {
            buttons: {
              include: {
                scene: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      },
    },
  },
};
