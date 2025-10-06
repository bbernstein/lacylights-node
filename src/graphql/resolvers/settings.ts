import { Context } from "../../context";
import { dmxService } from "../../services/dmx";
import { getNetworkInterfaces } from "../../utils/networkInterfaces";

export interface UpdateSettingInput {
  key: string;
  value: string;
}

export const settingsResolvers = {
  Query: {
    settings: async (_: any, __: any, { prisma }: Context) => {
      return prisma.setting.findMany({
        orderBy: { key: "asc" },
      });
    },

    setting: async (_: any, { key }: { key: string }, { prisma }: Context) => {
      return prisma.setting.findUnique({
        where: { key },
      });
    },

    systemInfo: async () => {
      return {
        artnetBroadcastAddress: dmxService.getBroadcastAddress(),
        artnetEnabled: dmxService.isArtNetEnabled(),
      };
    },

    networkInterfaceOptions: async () => {
      return getNetworkInterfaces();
    },
  },

  Mutation: {
    updateSetting: async (
      _: any,
      { input }: { input: UpdateSettingInput },
      { prisma }: Context,
    ) => {
      const result = await prisma.setting.upsert({
        where: { key: input.key },
        update: { value: input.value },
        create: {
          key: input.key,
          value: input.value,
        },
      });

      // If artnet_broadcast_address is updated, reload the DMX service
      if (input.key === 'artnet_broadcast_address') {
        try {
          await dmxService.reloadBroadcastAddress(input.value);
        } catch (error) {
          // Log the error but don't fail the mutation
          console.error('Error reloading Art-Net broadcast address:', error);
        }
      }

      return result;
    },
  },
};
