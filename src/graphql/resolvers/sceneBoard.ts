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
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface UpdateSceneBoardInput {
  name?: string;
  description?: string;
  defaultFadeTime?: number;
  gridSize?: number;
  canvasWidth?: number;
  canvasHeight?: number;
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

/**
 * Validate button position is within reasonable bounds
 * Allows negative coordinates for flexible scene organization
 * Validates coordinates are within reasonable limits to prevent extreme values
 */
function validateButtonPosition(
  layoutX: number,
  layoutY: number,
): void {
  // Allow negative and extended positive coordinates for flexible scene organization
  const MIN_COORDINATE = -10000;
  const MAX_COORDINATE = 20000;

  if (layoutX < MIN_COORDINATE || layoutX > MAX_COORDINATE) {
    throw new Error(`layoutX must be between ${MIN_COORDINATE} and ${MAX_COORDINATE}`);
  }
  if (layoutY < MIN_COORDINATE || layoutY > MAX_COORDINATE) {
    throw new Error(`layoutY must be between ${MIN_COORDINATE} and ${MAX_COORDINATE}`);
  }
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
              scene: {
                include: {
                  fixtureValues: {
                    include: {
                      fixture: true,
                    },
                  },
                },
              },
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
              scene: {
                include: {
                  fixtureValues: {
                    include: {
                      fixture: true,
                    },
                  },
                },
              },
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
          canvasWidth: input.canvasWidth ?? 2000,
          canvasHeight: input.canvasHeight ?? 2000,
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
      // If canvas size is being changed, validate existing buttons will still fit
      if (input.canvasWidth !== undefined || input.canvasHeight !== undefined) {
        const currentBoard = await prisma.sceneBoard.findUnique({
          where: { id },
          include: { buttons: true },
        });

        if (!currentBoard) {
          throw new Error("Scene board not found");
        }

        // Validate all existing button positions are within reasonable bounds
        for (const button of currentBoard.buttons) {
          try {
            validateButtonPosition(
              button.layoutX,
              button.layoutY,
            );
          } catch (error) {
            throw new Error(
              `Cannot resize canvas: Button "${button.id}" at (${button.layoutX}, ${button.layoutY}) ` +
                `has invalid coordinates. ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

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
          ...(input.canvasWidth !== undefined && {
            canvasWidth: input.canvasWidth,
          }),
          ...(input.canvasHeight !== undefined && {
            canvasHeight: input.canvasHeight,
          }),
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

      // Fetch scene board to get canvas dimensions for validation
      const sceneBoard = await prisma.sceneBoard.findUnique({
        where: { id: input.sceneBoardId },
      });

      if (!sceneBoard) {
        throw new Error("Scene board not found");
      }

      // Set defaults for width and height
      const width = input.width ?? 200;
      const height = input.height ?? 120;

      // Validate button position is within reasonable bounds
      validateButtonPosition(
        input.layoutX,
        input.layoutY,
      );

      return prisma.sceneBoardButton.create({
        data: {
          sceneBoardId: input.sceneBoardId,
          sceneId: input.sceneId,
          layoutX: input.layoutX,
          layoutY: input.layoutY,
          width,
          height,
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
      // Fetch current button and scene board for validation
      const button = await prisma.sceneBoardButton.findUnique({
        where: { id },
        include: { sceneBoard: true },
      });

      if (!button) {
        throw new Error("Scene board button not found");
      }

      // Validate new position if coordinates changed
      if (
        input.layoutX !== undefined ||
        input.layoutY !== undefined
      ) {
        const layoutX = input.layoutX ?? button.layoutX;
        const layoutY = input.layoutY ?? button.layoutY;

        validateButtonPosition(
          layoutX,
          layoutY,
        );
      }

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
      // Fetch all buttons with scene board info for validation
      const buttonIds = positions.map((p) => p.buttonId);
      const buttons = await prisma.sceneBoardButton.findMany({
        where: { id: { in: buttonIds } },
        include: { sceneBoard: true },
      });

      // Validate all positions before updating
      for (const pos of positions) {
        const button = buttons.find((b) => b.id === pos.buttonId);
        if (!button) {
          throw new Error(`Button ${pos.buttonId} not found`);
        }

        validateButtonPosition(
          pos.layoutX,
          pos.layoutY,
        );
      }

      // Batch update all button positions using a transaction to reduce database round trips
      const updates = positions.map((pos) =>
        prisma.sceneBoardButton.update({
          where: { id: pos.buttonId },
          data: {
            layoutX: pos.layoutX,
            layoutY: pos.layoutY,
          },
        }),
      );

      await prisma.$transaction(updates);
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

      // Start the fade with a consistent ID so scene board activations replace each other
      // This allows smooth transitions between scenes and naturally overrides cue list fades
      fadeEngine.fadeChannels(
        channelsToFade,
        fadeTime, // fadeTime is already in seconds (from sceneBoard.defaultFadeTime or fadeTimeOverride); fadeEngine.fadeChannels expects seconds, not milliseconds
        `scene-board-${sceneBoardId}`,
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
