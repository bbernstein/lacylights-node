import { Context } from '../../context';
import { dmxService } from '../../services/dmx';
import { fadeEngine, EasingType } from '../../services/fadeEngine';

export const dmxResolvers = {
  Query: {
    dmxOutput: async (_: any, { universe }: { universe: number }) => {
      return dmxService.getUniverseOutput(universe);
    },

    allDmxOutput: async () => {
      return dmxService.getAllUniverseOutputs();
    },
  },

  Mutation: {
    setChannelValue: async (_: any, { universe, channel, value }: { universe: number; channel: number; value: number }) => {
      dmxService.setChannelValue(universe, channel, value);
      return true;
    },

    setSceneLive: async (_: any, { sceneId }: { sceneId: string }, { prisma }: Context) => {
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
      const sceneChannels: Array<{ universe: number; channel: number; value: number }> = [];
      
      for (const fixtureValue of scene.fixtureValues) {
        const fixture = fixtureValue.fixture;
        
        // Iterate through channelValues array by index
        for (let channelIndex = 0; channelIndex < fixtureValue.channelValues.length; channelIndex++) {
          const value = fixtureValue.channelValues[channelIndex];
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

      return true;
    },

    playCue: async (_: any, { cueId, fadeInTime }: { cueId: string; fadeInTime?: number }, { prisma }: Context) => {
      // Get the cue with its scene
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
        },
      });

      if (!cue) {
        throw new Error(`Cue with ID ${cueId} not found`);
      }

      // Use provided fadeInTime or default to cue's fadeInTime
      const actualFadeTime = fadeInTime !== undefined ? fadeInTime : cue.fadeInTime;

      // Build array of all channel values for the scene
      const sceneChannels: Array<{ universe: number; channel: number; value: number }> = [];
      
      for (const fixtureValue of cue.scene.fixtureValues) {
        const fixture = fixtureValue.fixture;
        
        // Iterate through channelValues array by index
        for (let channelIndex = 0; channelIndex < fixtureValue.channelValues.length; channelIndex++) {
          const value = fixtureValue.channelValues[channelIndex];
          const dmxChannel = fixture.startChannel + channelIndex;
          
          sceneChannels.push({
            universe: fixture.universe,
            channel: dmxChannel,
            value: value,
          });
        }
      }

      // Use fade engine to transition to the scene with the cue's easing type
      fadeEngine.fadeToScene(sceneChannels, actualFadeTime, `cue-${cueId}`, cue.easingType as EasingType | undefined);

      return true;
    },

    fadeToBlack: async (_: any, { fadeOutTime }: { fadeOutTime: number }) => {
      // Use fade engine to fade all channels to black
      fadeEngine.fadeToBlack(fadeOutTime);
      return true;
    },
  },

  Subscription: {
    dmxOutputChanged: {
      // TODO: Implement DMX subscription logic
    },
  },
};
