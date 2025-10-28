import { Context, WebSocketContext } from "../../context";
import { wifiService, WiFiError } from "../../services/WiFiService";
import { logger } from "../../utils/logger";

// WiFi setting key constants
export const WIFI_SETTING_KEYS = {
  WIFI_ENABLED: "wifi_enabled",
  WIFI_LAST_SSID: "wifi_last_ssid",
} as const;

export interface ConnectWiFiInput {
  ssid: string;
  password?: string;
}

export interface SetWiFiEnabledInput {
  enabled: boolean;
}

export interface ForgetWiFiNetworkInput {
  ssid: string;
}

/**
 * GraphQL resolvers for WiFi configuration
 */
export const wifiResolvers = {
  Query: {
    /**
     * Scan for available WiFi networks
     */
    wifiNetworks: async (
      _: unknown,
      { rescan = true }: { rescan?: boolean }
    ) => {
      try {
        const networks = await wifiService.scanNetworks(rescan);
        return networks;
      } catch (error) {
        logger.error("Error scanning WiFi networks", { error });

        // Return empty array if scan fails rather than throwing
        // This allows the UI to gracefully handle scan failures
        if (error instanceof WiFiError) {
          logger.warn(
            `WiFi scan failed: ${error.message} (${error.code})`,
            error.details ? { details: error.details } : undefined
          );
        }
        return [];
      }
    },

    /**
     * Get current WiFi connection status
     */
    wifiStatus: async () => {
      try {
        return await wifiService.getStatus();
      } catch (error) {
        logger.error("Error getting WiFi status", { error });

        // Return default status if check fails
        return {
          available: false,
          enabled: false,
          connected: false,
        };
      }
    },

    /**
     * Get list of saved WiFi networks
     */
    savedWifiNetworks: async () => {
      try {
        return await wifiService.getSavedNetworks();
      } catch (error) {
        logger.error("Error getting saved WiFi networks", { error });
        return [];
      }
    },
  },

  Mutation: {
    /**
     * Connect to a WiFi network
     */
    connectWiFi: async (
      _: unknown,
      { ssid, password }: ConnectWiFiInput,
      { prisma, pubsub }: Context
    ) => {
      try {
        const result = await wifiService.connect(ssid, password);

        // Save last connected SSID to settings
        if (result.success) {
          await prisma.setting.upsert({
            where: { key: WIFI_SETTING_KEYS.WIFI_LAST_SSID },
            update: { value: ssid },
            create: {
              key: WIFI_SETTING_KEYS.WIFI_LAST_SSID,
              value: ssid,
            },
          });

          // Publish WiFi status update
          const status = await wifiService.getStatus();
          await pubsub.publish("WIFI_STATUS_UPDATED", {
            wifiStatusUpdated: status,
          });
        }

        return result;
      } catch (error) {
        logger.error("Error connecting to WiFi", { ssid, error });

        if (error instanceof WiFiError) {
          return {
            success: false,
            message: error.message,
            connected: false,
          };
        }

        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to connect to WiFi",
          connected: false,
        };
      }
    },

    /**
     * Disconnect from current WiFi network
     */
    disconnectWiFi: async (_: unknown, __: unknown, { pubsub }: Context) => {
      try {
        const result = await wifiService.disconnect();

        // Publish WiFi status update
        const status = await wifiService.getStatus();
        await pubsub.publish("WIFI_STATUS_UPDATED", {
          wifiStatusUpdated: status,
        });

        return result;
      } catch (error) {
        logger.error("Error disconnecting from WiFi", { error });

        if (error instanceof WiFiError) {
          return {
            success: false,
            message: error.message,
            connected: true, // Assume still connected if disconnect fails
          };
        }

        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to disconnect from WiFi",
          connected: true,
        };
      }
    },

    /**
     * Enable or disable WiFi radio
     */
    setWiFiEnabled: async (
      _: unknown,
      { enabled }: SetWiFiEnabledInput,
      { prisma, pubsub }: Context
    ) => {
      try {
        const status = await wifiService.setEnabled(enabled);

        // Save WiFi enabled state to settings
        await prisma.setting.upsert({
          where: { key: WIFI_SETTING_KEYS.WIFI_ENABLED },
          update: { value: enabled ? "true" : "false" },
          create: {
            key: WIFI_SETTING_KEYS.WIFI_ENABLED,
            value: enabled ? "true" : "false",
          },
        });

        // Publish WiFi status update
        await pubsub.publish("WIFI_STATUS_UPDATED", {
          wifiStatusUpdated: status,
        });

        return status;
      } catch (error) {
        logger.error(`Error ${enabled ? "enabling" : "disabling"} WiFi`, {
          error,
        });

        // Return current status on error
        return await wifiService.getStatus();
      }
    },

    /**
     * Forget a saved WiFi network
     */
    forgetWiFiNetwork: async (
      _: unknown,
      { ssid }: ForgetWiFiNetworkInput,
      { pubsub }: Context
    ) => {
      try {
        const result = await wifiService.forgetNetwork(ssid);

        // Publish WiFi status update
        const status = await wifiService.getStatus();
        await pubsub.publish("WIFI_STATUS_UPDATED", {
          wifiStatusUpdated: status,
        });

        return result;
      } catch (error) {
        logger.error("Error forgetting WiFi network", { ssid, error });
        return false;
      }
    },
  },

  Subscription: {
    /**
     * Subscribe to WiFi status changes
     */
    wifiStatusUpdated: {
      subscribe: (_: unknown, __: unknown, { pubsub }: WebSocketContext) => {
        return pubsub.asyncIterator(["WIFI_STATUS_UPDATED"]);
      },
    },
  },
};
