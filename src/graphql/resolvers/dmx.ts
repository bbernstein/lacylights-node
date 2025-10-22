import { Context } from "../../context";
import { dmxService } from "../../services/dmx";
import { fadeEngine } from "../../services/fadeEngine";
import { getPlaybackStateService } from "../../services/playbackStateService";

export const dmxResolvers = {
  Query: {
    dmxOutput: async (_: any, { universe }: { universe: number }) => {
      return dmxService.getUniverseOutput(universe);
    },

    allDmxOutput: async () => {
      return dmxService.getAllUniverseOutputs();
    },

    currentActiveScene: async (_: any, __: any, { prisma }: Context) => {
      const currentActiveSceneId = dmxService.getCurrentActiveSceneId();

      if (!currentActiveSceneId) {
        return null;
      }

      // Fetch the scene from the database
      const scene = await prisma.scene.findUnique({
        where: { id: currentActiveSceneId },
        include: {
          project: true,
          fixtureValues: {
            include: {
              fixture: true,
            },
          },
        },
      });

      return scene;
    },
  },

  Mutation: {
    setChannelValue: async (
      _: any,
      {
        universe,
        channel,
        value,
      }: { universe: number; channel: number; value: number },
    ) => {
      dmxService.setChannelValue(universe, channel, value);
      return true;
    },

    setSceneLive: async (
      _: any,
      { sceneId }: { sceneId: string },
      { prisma }: Context,
    ) => {
      // Get the scene with all its fixture values and channel values
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          fixtureValues: {
            include: {
              fixture: true,
            },
          },
        },
      });

      if (!scene) {
        throw new Error(`Scene with ID ${sceneId} not found`);
      }

      // Build array of all channel values for the scene
      const sceneChannels: Array<{
        universe: number;
        channel: number;
        value: number;
      }> = [];

      for (const fixtureValue of scene.fixtureValues) {
        const fixture = fixtureValue.fixture;

        // channelValues might be a string (from DB) or array (if middleware deserialized it)
        let channelValues: number[] = [];
        if (typeof fixtureValue.channelValues === 'string') {
          try {
            channelValues = JSON.parse(fixtureValue.channelValues);
          } catch {
            channelValues = [];
          }
        } else {
          channelValues = fixtureValue.channelValues as unknown as number[];
        }

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

      // Instant scene change (0 second fade)
      fadeEngine.fadeToScene(sceneChannels, 0, `scene-${sceneId}`);

      // Track the currently active scene
      dmxService.setActiveScene(sceneId);

      return true;
    },

    playCue: async (
      _: any,
      { cueId, fadeInTime }: { cueId: string; fadeInTime?: number },
      { prisma }: Context,
    ) => {
      // Get the cue with its scene and cue list
      const cue = await prisma.cue.findUnique({
        where: { id: cueId },
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
          cueList: {
            include: {
              cues: {
                orderBy: { cueNumber: "asc" },
              },
            },
          },
        },
      });

      if (!cue) {
        throw new Error(`Cue with ID ${cueId} not found`);
      }

      // Get playback service and execute the cue's DMX output
      const playbackService = getPlaybackStateService();
      await playbackService.executeCueDmx(cue, fadeInTime);

      // Update playback state service to track cue execution
      const cueIndex = cue.cueList.cues.findIndex((c) => c.id === cueId);

      if (cueIndex !== -1) {
        await playbackService.startCue(cue.cueList.id, cueIndex, cue);
      }

      return true;
    },

    fadeToBlack: async (_: any, { fadeOutTime }: { fadeOutTime: number }) => {
      // Use fade engine to fade all channels to black
      fadeEngine.fadeToBlack(fadeOutTime);

      // Clear the currently active scene since we're fading to black
      dmxService.clearActiveScene();

      // Stop all playback states since we're fading to black
      const playbackService = getPlaybackStateService();
      playbackService.stopAllCueLists();

      return true;
    },
  },
};
