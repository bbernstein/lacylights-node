import { Context } from '../../context';
import { dmxService } from '../../services/dmx';

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
  },

  Subscription: {
    dmxOutputChanged: {
      // TODO: Implement DMX subscription logic
    },
  },
};
