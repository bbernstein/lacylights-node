import { wifiResolvers, WIFI_SETTING_KEYS } from "../wifi";
import { wifiService, WiFiError, WiFiErrorCode, WiFiSecurityType } from "../../../services/WiFiService";
import type { Context, WebSocketContext } from "../../../context";
import { PubSub } from "graphql-subscriptions";

// Mock WiFiService
jest.mock("../../../services/WiFiService", () => {
  const actual = jest.requireActual("../../../services/WiFiService");
  return {
    ...actual,
    wifiService: {
      scanNetworks: jest.fn(),
      getStatus: jest.fn(),
      getSavedNetworks: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      setEnabled: jest.fn(),
      forgetNetwork: jest.fn(),
    },
  };
});

// Mock logger
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("WiFi GraphQL Resolvers", () => {
  let mockContext: Context;
  let mockPubSub: PubSub;
  let mockPrisma: any;

  beforeEach(() => {
    mockPubSub = new PubSub();
    mockPrisma = {
      setting: {
        upsert: jest.fn(),
      },
    };

    mockContext = {
      prisma: mockPrisma,
      pubsub: mockPubSub,
    } as unknown as Context;

    jest.clearAllMocks();
  });

  describe("Query.wifiNetworks", () => {
    it("should return list of WiFi networks", async () => {
      const mockNetworks = [
        {
          ssid: "Network1",
          signalStrength: 85,
          frequency: "2.4 GHz",
          security: WiFiSecurityType.WPA_PSK,
          inUse: true,
          saved: true,
        },
        {
          ssid: "Network2",
          signalStrength: 65,
          frequency: "5 GHz",
          security: WiFiSecurityType.WPA3_PSK,
          inUse: false,
          saved: false,
        },
      ];

      (wifiService.scanNetworks as jest.Mock).mockResolvedValue(mockNetworks);

      const result = await wifiResolvers.Query.wifiNetworks(
        undefined,
        { rescan: true }
      );

      expect(result).toEqual(mockNetworks);
      expect(wifiService.scanNetworks).toHaveBeenCalledWith(true);
    });

    it("should use default rescan value of true", async () => {
      (wifiService.scanNetworks as jest.Mock).mockResolvedValue([]);

      await wifiResolvers.Query.wifiNetworks(undefined, {});

      expect(wifiService.scanNetworks).toHaveBeenCalledWith(true);
    });

    it("should return empty array on WiFiError", async () => {
      const error = new WiFiError(
        "Scan failed",
        WiFiErrorCode.SCAN_FAILED,
        "details"
      );
      (wifiService.scanNetworks as jest.Mock).mockRejectedValue(error);

      const result = await wifiResolvers.Query.wifiNetworks(
        undefined,
        { rescan: false }
      );

      expect(result).toEqual([]);
    });

    it("should return empty array on general error", async () => {
      (wifiService.scanNetworks as jest.Mock).mockRejectedValue(
        new Error("General error")
      );

      const result = await wifiResolvers.Query.wifiNetworks(
        undefined,
        { rescan: true }
      );

      expect(result).toEqual([]);
    });
  });

  describe("Query.wifiStatus", () => {
    it("should return WiFi status", async () => {
      const mockStatus = {
        available: true,
        enabled: true,
        connected: true,
        ssid: "MyNetwork",
        signalStrength: 75,
        ipAddress: "192.168.1.100",
        macAddress: "AA:BB:CC:DD:EE:FF",
        frequency: "2.4 GHz",
      };

      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const result = await wifiResolvers.Query.wifiStatus();

      expect(result).toEqual(mockStatus);
      expect(wifiService.getStatus).toHaveBeenCalled();
    });

    it("should return default status on error", async () => {
      (wifiService.getStatus as jest.Mock).mockRejectedValue(
        new Error("Status check failed")
      );

      const result = await wifiResolvers.Query.wifiStatus();

      expect(result).toEqual({
        available: false,
        enabled: false,
        connected: false,
      });
    });
  });

  describe("Query.savedWifiNetworks", () => {
    it("should return list of saved networks", async () => {
      const mockSavedNetworks = [
        {
          ssid: "SavedNetwork1",
          signalStrength: 70,
          frequency: "2.4 GHz",
          security: WiFiSecurityType.WPA_PSK,
          inUse: true,
          saved: true,
        },
      ];

      (wifiService.getSavedNetworks as jest.Mock).mockResolvedValue(
        mockSavedNetworks
      );

      const result = await wifiResolvers.Query.savedWifiNetworks();

      expect(result).toEqual(mockSavedNetworks);
      expect(wifiService.getSavedNetworks).toHaveBeenCalled();
    });

    it("should return empty array on error", async () => {
      (wifiService.getSavedNetworks as jest.Mock).mockRejectedValue(
        new Error("Failed to get saved networks")
      );

      const result = await wifiResolvers.Query.savedWifiNetworks();

      expect(result).toEqual([]);
    });
  });

  describe("Mutation.connectWiFi", () => {
    it("should connect to WiFi with password and save settings", async () => {
      const mockResult = {
        success: true,
        message: "Connected to TestNetwork",
        connected: true,
      };

      const mockStatus = {
        available: true,
        enabled: true,
        connected: true,
        ssid: "TestNetwork",
      };

      (wifiService.connect as jest.Mock).mockResolvedValue(mockResult);
      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const publishSpy = jest.spyOn(mockPubSub, "publish");

      const result = await wifiResolvers.Mutation.connectWiFi(
        undefined,
        { ssid: "TestNetwork", password: "testpass" },
        mockContext
      );

      expect(result).toEqual(mockResult);
      expect(wifiService.connect).toHaveBeenCalledWith("TestNetwork", "testpass");
      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { key: WIFI_SETTING_KEYS.WIFI_LAST_SSID },
        update: { value: "TestNetwork" },
        create: {
          key: WIFI_SETTING_KEYS.WIFI_LAST_SSID,
          value: "TestNetwork",
        },
      });
      expect(publishSpy).toHaveBeenCalledWith("WIFI_STATUS_UPDATED", {
        wifiStatusUpdated: mockStatus,
      });
    });

    it("should connect to open network without password", async () => {
      const mockResult = {
        success: true,
        message: "Connected to OpenNetwork",
        connected: true,
      };

      const mockStatus = {
        available: true,
        enabled: true,
        connected: true,
        ssid: "OpenNetwork",
      };

      (wifiService.connect as jest.Mock).mockResolvedValue(mockResult);
      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const result = await wifiResolvers.Mutation.connectWiFi(
        undefined,
        { ssid: "OpenNetwork" },
        mockContext
      );

      expect(result).toEqual(mockResult);
      expect(wifiService.connect).toHaveBeenCalledWith("OpenNetwork", undefined);
    });

    it("should return error result on WiFiError", async () => {
      const error = new WiFiError(
        "Invalid password",
        WiFiErrorCode.INVALID_PASSWORD,
        "details"
      );
      (wifiService.connect as jest.Mock).mockRejectedValue(error);

      const result = await wifiResolvers.Mutation.connectWiFi(
        undefined,
        { ssid: "TestNetwork", password: "wrongpass" },
        mockContext
      );

      expect(result).toEqual({
        success: false,
        message: "Invalid password",
        connected: false,
      });
      expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    });

    it("should return error result on general error", async () => {
      (wifiService.connect as jest.Mock).mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await wifiResolvers.Mutation.connectWiFi(
        undefined,
        { ssid: "TestNetwork", password: "pass" },
        mockContext
      );

      expect(result).toEqual({
        success: false,
        message: "Connection failed",
        connected: false,
      });
    });

    it("should not save settings when connection fails", async () => {
      const mockResult = {
        success: false,
        message: "Connection failed",
        connected: false,
      };

      (wifiService.connect as jest.Mock).mockResolvedValue(mockResult);

      await wifiResolvers.Mutation.connectWiFi(
        undefined,
        { ssid: "TestNetwork", password: "pass" },
        mockContext
      );

      expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    });
  });

  describe("Mutation.disconnectWiFi", () => {
    it("should disconnect from WiFi and publish update", async () => {
      const mockResult = {
        success: true,
        message: "Disconnected from MyNetwork",
        connected: false,
      };

      const mockStatus = {
        available: true,
        enabled: true,
        connected: false,
      };

      (wifiService.disconnect as jest.Mock).mockResolvedValue(mockResult);
      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const publishSpy = jest.spyOn(mockPubSub, "publish");

      const result = await wifiResolvers.Mutation.disconnectWiFi(
        undefined,
        undefined,
        mockContext
      );

      expect(result).toEqual(mockResult);
      expect(wifiService.disconnect).toHaveBeenCalled();
      expect(publishSpy).toHaveBeenCalledWith("WIFI_STATUS_UPDATED", {
        wifiStatusUpdated: mockStatus,
      });
    });

    it("should return error result on WiFiError", async () => {
      const error = new WiFiError(
        "Disconnect failed",
        WiFiErrorCode.CONNECTION_FAILED,
        "details"
      );
      (wifiService.disconnect as jest.Mock).mockRejectedValue(error);

      const result = await wifiResolvers.Mutation.disconnectWiFi(
        undefined,
        undefined,
        mockContext
      );

      expect(result).toEqual({
        success: false,
        message: "Disconnect failed",
        connected: true,
      });
    });

    it("should return error result on general error", async () => {
      (wifiService.disconnect as jest.Mock).mockRejectedValue(
        new Error("Disconnect error")
      );

      const result = await wifiResolvers.Mutation.disconnectWiFi(
        undefined,
        undefined,
        mockContext
      );

      expect(result).toEqual({
        success: false,
        message: "Disconnect error",
        connected: true,
      });
    });
  });

  describe("Mutation.setWiFiEnabled", () => {
    it("should enable WiFi and save settings", async () => {
      const mockStatus = {
        available: true,
        enabled: true,
        connected: false,
      };

      (wifiService.setEnabled as jest.Mock).mockResolvedValue(mockStatus);

      const publishSpy = jest.spyOn(mockPubSub, "publish");

      const result = await wifiResolvers.Mutation.setWiFiEnabled(
        undefined,
        { enabled: true },
        mockContext
      );

      expect(result).toEqual(mockStatus);
      expect(wifiService.setEnabled).toHaveBeenCalledWith(true);
      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { key: WIFI_SETTING_KEYS.WIFI_ENABLED },
        update: { value: "true" },
        create: {
          key: WIFI_SETTING_KEYS.WIFI_ENABLED,
          value: "true",
        },
      });
      expect(publishSpy).toHaveBeenCalledWith("WIFI_STATUS_UPDATED", {
        wifiStatusUpdated: mockStatus,
      });
    });

    it("should disable WiFi and save settings", async () => {
      const mockStatus = {
        available: true,
        enabled: false,
        connected: false,
      };

      (wifiService.setEnabled as jest.Mock).mockResolvedValue(mockStatus);

      const result = await wifiResolvers.Mutation.setWiFiEnabled(
        undefined,
        { enabled: false },
        mockContext
      );

      expect(result).toEqual(mockStatus);
      expect(wifiService.setEnabled).toHaveBeenCalledWith(false);
      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { key: WIFI_SETTING_KEYS.WIFI_ENABLED },
        update: { value: "false" },
        create: {
          key: WIFI_SETTING_KEYS.WIFI_ENABLED,
          value: "false",
        },
      });
    });

    it("should return current status on error", async () => {
      const mockStatus = {
        available: true,
        enabled: true,
        connected: true,
      };

      (wifiService.setEnabled as jest.Mock).mockRejectedValue(
        new Error("Set enabled failed")
      );
      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const result = await wifiResolvers.Mutation.setWiFiEnabled(
        undefined,
        { enabled: false },
        mockContext
      );

      expect(result).toEqual(mockStatus);
      expect(wifiService.getStatus).toHaveBeenCalled();
    });
  });

  describe("Mutation.forgetWiFiNetwork", () => {
    it("should forget network and publish update", async () => {
      const mockStatus = {
        available: true,
        enabled: true,
        connected: false,
      };

      (wifiService.forgetNetwork as jest.Mock).mockResolvedValue(true);
      (wifiService.getStatus as jest.Mock).mockResolvedValue(mockStatus);

      const publishSpy = jest.spyOn(mockPubSub, "publish");

      const result = await wifiResolvers.Mutation.forgetWiFiNetwork(
        undefined,
        { ssid: "OldNetwork" },
        mockContext
      );

      expect(result).toBe(true);
      expect(wifiService.forgetNetwork).toHaveBeenCalledWith("OldNetwork");
      expect(publishSpy).toHaveBeenCalledWith("WIFI_STATUS_UPDATED", {
        wifiStatusUpdated: mockStatus,
      });
    });

    it("should return false on error", async () => {
      (wifiService.forgetNetwork as jest.Mock).mockRejectedValue(
        new Error("Forget failed")
      );

      const result = await wifiResolvers.Mutation.forgetWiFiNetwork(
        undefined,
        { ssid: "OldNetwork" },
        mockContext
      );

      expect(result).toBe(false);
    });
  });

  describe("Subscription.wifiStatusUpdated", () => {
    it("should return async iterator for WIFI_STATUS_UPDATED", () => {
      const mockWebSocketContext = {
        pubsub: mockPubSub,
      } as WebSocketContext;

      const asyncIteratorSpy = jest.spyOn(mockPubSub, "asyncIterator");

      const result = wifiResolvers.Subscription.wifiStatusUpdated.subscribe(
        undefined,
        undefined,
        mockWebSocketContext
      );

      expect(asyncIteratorSpy).toHaveBeenCalledWith(["WIFI_STATUS_UPDATED"]);
      expect(result).toBeDefined();
    });
  });

  describe("WIFI_SETTING_KEYS", () => {
    it("should have correct setting key constants", () => {
      expect(WIFI_SETTING_KEYS.WIFI_ENABLED).toBe("wifi_enabled");
      expect(WIFI_SETTING_KEYS.WIFI_LAST_SSID).toBe("wifi_last_ssid");
    });
  });
});
