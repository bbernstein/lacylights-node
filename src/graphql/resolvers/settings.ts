import { Context } from "../../context";
import { dmxService } from "../../services/dmx";

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
  },

  Mutation: {
    updateSetting: async (
      _: any,
      { input }: { input: UpdateSettingInput },
      { prisma }: Context,
    ) => {
      return prisma.setting.upsert({
        where: { key: input.key },
        update: { value: input.value },
        create: {
          key: input.key,
          value: input.value,
        },
      });
    },
  },
};
