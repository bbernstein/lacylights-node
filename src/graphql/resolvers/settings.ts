import { Context, pubsub, WebSocketContext } from "../../context";
import { dmxService } from "../../services/dmx";
import { getNetworkInterfaces } from "../../utils/networkInterfaces";
import { logger } from "../../utils/logger";

// Setting key constants
export const SETTING_KEYS = {
  ARTNET_BROADCAST_ADDRESS: "artnet_broadcast_address",
} as const;

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
      if (input.key === SETTING_KEYS.ARTNET_BROADCAST_ADDRESS) {
        try {
          await dmxService.reloadBroadcastAddress(input.value);
        } catch (error) {
          // Log the error but don't fail the mutation.
          // Design decision: We don't throw here because the database update succeeded.
          // Throwing would make the mutation appear to fail when the database was actually updated.
          // The new value will be used on next server restart.
          // This creates a temporary inconsistency (DB has new value, runtime has old value),
          // but allows the setting to be persisted even if hot-reload fails.
          logger.error(
            "Error reloading Art-Net broadcast address. The database setting was saved, but the Art-Net service failed to reload and will continue using the previous broadcast address.",
            {
              error,
              attemptedBroadcastAddress: input.value,
            }
          );
        }

        // Publish system info update to all subscribed clients
        await pubsub.publish("SYSTEM_INFO_UPDATED", {
          systemInfoUpdated: {
            artnetBroadcastAddress: dmxService.getBroadcastAddress(),
            artnetEnabled: dmxService.isArtNetEnabled(),
          },
        });
      }

      return result;
    },
  },

  Subscription: {
    systemInfoUpdated: {
      subscribe: (_: unknown, __: unknown, { pubsub }: WebSocketContext) => {
        return pubsub.asyncIterator(["SYSTEM_INFO_UPDATED"]);
      },
    },
  },
};
