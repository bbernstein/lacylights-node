/**
 * Comprehensive WiFiService tests
 *
 * These tests mock external command execution to test the service logic.
 * Full integration tests would require running on a system with NetworkManager.
 */

// Must mock before imports
const mockExec = jest.fn();
jest.mock("child_process", () => ({
  exec: (...args: any[]) => mockExec(...args),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { WiFiService, WiFiError, WiFiErrorCode, WiFiSecurityType } from "../WiFiService";

describe("WiFiService", () => {
  let wifiService: WiFiService;

  beforeEach(() => {
    wifiService = new WiFiService("wlan0");
    jest.clearAllMocks();
  });

  describe("Error Classes", () => {
    it("should create WiFiError with proper properties", () => {
      const error = new WiFiError(
        "Test error",
        WiFiErrorCode.SCAN_FAILED,
        "test details"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WiFiError);
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WiFiErrorCode.SCAN_FAILED);
      expect(error.details).toBe("test details");
      expect(error.name).toBe("WiFiError");
    });

    it("should create WiFiError without details", () => {
      const error = new WiFiError("Test error", WiFiErrorCode.NETWORK_NOT_FOUND);

      expect(error.message).toBe("Test error");
      expect(error.code).toBe(WiFiErrorCode.NETWORK_NOT_FOUND);
      expect(error.details).toBeUndefined();
    });
  });

  describe("isWiFiSupported", () => {
    it("should return false when nmcli is not available", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("command not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      const result = await wifiService.isWiFiSupported();
      expect(result).toBe(false);
    });

    it("should return false when no WiFi device found", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else {
          callback(null, { stdout: "eth0  ethernet  connected", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isWiFiSupported();
      expect(result).toBe(false);
    });

    it("should return true when WiFi device found by device name", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isWiFiSupported();
      expect(result).toBe(true);
    });

    it("should return true when WiFi type found in device list", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else {
          callback(null, { stdout: "wlan1  wifi  disconnected", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isWiFiSupported();
      expect(result).toBe(true);
    });

    it("should return false and log on error checking device status", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else {
          callback(new Error("device check failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isWiFiSupported();
      expect(result).toBe(false);
    });
  });

  describe("scanNetworks", () => {
    it("should throw WiFiError when nmcli not available", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.scanNetworks();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should parse network list with all security types", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(
            null,
            {
              stdout:
                "Net1:85:6:WPA3 EAP:*\n" +
                "Net2:80:6:WPA3::\n" +
                "Net3:75:6:WPA EAP::\n" +
                "Net4:70:6:WPA::\n" +
                "Net5:65:6:WEP::\n" +
                "Net6:60:6:OWE::\n" +
                "Net7:55:1:--::\n" +
                "Net8:50:36:WPA2::",
              stderr: "",
            },
            ""
          );
        } else {
          callback(null, { stdout: "Net1\nNet4\n", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks();

      expect(networks).toHaveLength(8);
      expect(networks[0].security).toBe(WiFiSecurityType.WPA3_EAP);
      expect(networks[1].security).toBe(WiFiSecurityType.WPA3_PSK);
      expect(networks[2].security).toBe(WiFiSecurityType.WPA_EAP);
      expect(networks[3].security).toBe(WiFiSecurityType.WPA_PSK);
      expect(networks[4].security).toBe(WiFiSecurityType.WEP);
      expect(networks[5].security).toBe(WiFiSecurityType.OWE);
      expect(networks[6].security).toBe(WiFiSecurityType.OPEN);
      expect(networks[7].frequency).toBe("5 GHz");
    });

    it("should handle unknown frequency channels", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "Net1:85:0:WPA2::", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks();

      expect(networks[0].frequency).toBe("Unknown");
    });

    it("should skip lines with insufficient fields", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "incomplete:data\nNet1:85:6:WPA2::", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks();

      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe("Net1");
    });

    it("should skip empty lines", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "\n\nNet1:85:6:WPA2::\n\n", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks();

      expect(networks).toHaveLength(1);
    });

    it("should use rescan parameter correctly", async () => {
      let callCount = 0;
      let scanCmd = "";
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (cmd.includes("device wifi list")) {
          scanCmd = cmd;
        }
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "Net1:85:6:WPA2::", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      await wifiService.scanNetworks(false);

      expect(scanCmd).toContain("--rescan no");
    });

    it("should throw SCAN_FAILED on scan error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else {
          callback(new Error("scan failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.scanNetworks();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.SCAN_FAILED);
      }
      expect(caught).toBe(true);
    });

    it("should default to WPA_PSK for unknown security types", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "Net1:85:6:UnknownType::", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks();

      expect(networks).toHaveLength(1);
      expect(networks[0].security).toBe(WiFiSecurityType.WPA_PSK);
    });

    it("should deduplicate networks and prefer stronger signal", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // Same SSID with different signal strengths
          callback(null, {
            stdout: "DuplicateNet:60:6:WPA2::\nDuplicateNet:80:6:WPA2::\nDuplicateNet:70:6:WPA2::",
            stderr: ""
          }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks(true, true); // deduplicate = true

      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe("DuplicateNet");
      expect(networks[0].signalStrength).toBe(80); // Should keep the strongest
    });

    it("should deduplicate networks and prefer 5 GHz when signal strengths are similar", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // Same SSID, similar signal strength, different frequencies
          // 5 GHz network has slightly weaker signal (77 vs 80, diff = 3 which is ≤ 5%)
          callback(null, {
            stdout: "SimilarNet:80:6:WPA2::\nSimilarNet:77:36:WPA2::",
            stderr: ""
          }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks(true, true); // deduplicate = true

      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe("SimilarNet");
      expect(networks[0].frequency).toBe("5 GHz"); // Should prefer 5 GHz
      expect(networks[0].signalStrength).toBe(77);
    });

    it("should preserve inUse and saved flags when deduplicating", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // Same SSID with * (inUse) on one entry
          callback(null, {
            stdout: "FlaggedNet:80:6:WPA2:*\nFlaggedNet:75:36:WPA2::",
            stderr: ""
          }, "");
        } else {
          callback(null, { stdout: "FlaggedNet", stderr: "" }, ""); // saved network
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks(true, true);

      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe("FlaggedNet");
      expect(networks[0].inUse).toBe(true); // Should preserve inUse flag
      expect(networks[0].saved).toBe(true); // Should preserve saved flag
    });

    it("should not deduplicate when deduplicate parameter is false", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, {
            stdout: "DupNet:80:6:WPA2::\nDupNet:75:36:WPA2::",
            stderr: ""
          }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.scanNetworks(true, false); // deduplicate = false

      expect(networks).toHaveLength(2); // Should keep both entries
      expect(networks[0].ssid).toBe("DupNet");
      expect(networks[1].ssid).toBe("DupNet");
    });
  });

  describe("getStatus", () => {
    it("should return unavailable when WiFi not supported", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(false);
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
    });

    it("should return disabled status", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 2) {
          callback(null, { stdout: callCount === 1 ? "/usr/bin/nmcli" : "wlan0  wifi", stderr: "" }, "");
        } else {
          callback(null, { stdout: "disabled", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
    });

    it("should return disconnected when enabled but no connection", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 2) {
          callback(null, { stdout: callCount === 1 ? "/usr/bin/nmcli" : "wlan0  wifi", stderr: "" }, "");
        } else if (callCount === 3) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(false);
    });

    it("should return full connected status with all details", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1 || callCount === 2) {
          callback(null, { stdout: callCount === 1 ? "/usr/bin/nmcli" : "wlan0  wifi", stderr: "" }, "");
        } else if (callCount === 3) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (callCount === 4) {
          callback(null, { stdout: "MyNetwork:802-11-wireless:wlan0", stderr: "" }, "");
        } else if (callCount === 5) {
          callback(
            null,
            {
              stdout:
                "connection.id:MyNetwork\n" +
                "802-11-wireless.ssid:MyNetwork\n" +
                "IP4.ADDRESS:192.168.1.100/24",
              stderr: "",
            },
            ""
          );
        } else if (callCount === 6) {
          callback(null, { stdout: "GENERAL.HWADDR:AA:BB:CC:DD:EE:FF", stderr: "" }, "");
        } else if (callCount === 7) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (callCount === 8) {
          callback(null, { stdout: "MyNetwork:75:6:WPA2:*", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.ssid).toBe("MyNetwork");
      expect(status.signalStrength).toBe(75);
      expect(status.ipAddress).toBe("192.168.1.100");
      expect(status.macAddress).toBe("AA:BB:CC:DD:EE:FF");
      expect(status.frequency).toBe("2.4 GHz");
    });

    it("should return default status on error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 2) {
          callback(null, { stdout: callCount === 1 ? "/usr/bin/nmcli" : "wlan0  wifi", stderr: "" }, "");
        } else {
          callback(new Error("failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
    });

    it("should detect connection via scan when connection show returns empty", async () => {
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device status")) {
          callback(null, { stdout: "wlan0  wifi", stderr: "" }, "");
        } else if (cmd.includes("radio wifi")) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("NAME,TYPE,DEVICE")) {
          // First connection show --active call (empty - no active connection detected)
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // scan finds active network marked with *
          callback(null, { stdout: "ActiveNet:80:36:WPA2:*", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("IP4.ADDRESS")) {
          // Second connection show --active call (for IP address)
          callback(null, { stdout: "IP4.ADDRESS:192.168.1.50/24", stderr: "" }, "");
        } else if (cmd.includes("device show")) {
          // device show (for MAC address)
          callback(null, { stdout: "GENERAL.HWADDR:11:22:33:44:55:66", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.ssid).toBe("ActiveNet");
      expect(status.signalStrength).toBe(80);
      expect(status.ipAddress).toBe("192.168.1.50");
      expect(status.macAddress).toBe("11:22:33:44:55:66");
      expect(status.frequency).toBe("5 GHz");
    });

    it("should handle error getting connection details during scan fallback", async () => {
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device status")) {
          callback(null, { stdout: "wlan0  wifi", stderr: "" }, "");
        } else if (cmd.includes("radio wifi")) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("NAME,TYPE,DEVICE")) {
          // First connection show --active call (empty - no active connection detected)
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // scan finds active network marked with *
          callback(null, { stdout: "ActiveNet:75:6:WPA2:*", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("IP4.ADDRESS")) {
          // Second connection show --active call (fails to get IP address)
          callback(new Error("Connection details failed"), { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.ssid).toBe("ActiveNet");
      expect(status.signalStrength).toBe(75);
      expect(status.frequency).toBe("2.4 GHz");
      expect(status.ipAddress).toBeUndefined();
      expect(status.macAddress).toBeUndefined();
    });

    it("should handle missing MAC address line during scan fallback", async () => {
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd.includes("device status")) {
          callback(null, { stdout: "wlan0  wifi", stderr: "" }, "");
        } else if (cmd.includes("radio wifi")) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("NAME,TYPE,DEVICE")) {
          // First connection show --active call (empty - no active connection detected)
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          // scan finds active network marked with *
          callback(null, { stdout: "TestNet:70:11:WPA2:*", stderr: "" }, "");
        } else if (cmd.includes("connection show --active") && cmd.includes("IP4.ADDRESS")) {
          // Second connection show --active call (for IP address)
          callback(null, { stdout: "IP4.ADDRESS:10.0.0.100/24", stderr: "" }, "");
        } else if (cmd.includes("device show")) {
          // device show returns output without GENERAL.HWADDR line
          callback(null, { stdout: "GENERAL.DEVICE:wlan0\nGENERAL.TYPE:wifi", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.getStatus();

      expect(status.available).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.ssid).toBe("TestNet");
      expect(status.signalStrength).toBe(70);
      expect(status.ipAddress).toBe("10.0.0.100");
      expect(status.macAddress).toBeUndefined(); // MAC address line not found
      expect(status.frequency).toBe("2.4 GHz");
    });
  });

  describe("connect", () => {
    it("should throw NMCLI_NOT_FOUND when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.connect("TestNet", "pass");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should throw WIFI_DISABLED when WiFi is disabled", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1 || callCount === 2 || callCount === 3) {
          const responses = ["/usr/bin/nmcli", "wlan0  wifi", "disabled"];
          callback(null, { stdout: responses[callCount - 1], stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.connect("TestNet", "pass");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.WIFI_DISABLED);
      }
      expect(caught).toBe(true);
    });

    it("should return success when already connected to same network", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  connected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "TestNet:802-11-wireless:wlan0", stderr: "" }, "");
        } else if (cmd.includes('connection show "')) {
          callback(null, { stdout: "802-11-wireless.ssid:TestNet", stderr: "" }, "");
        } else if (cmd.includes("device wifi list")) {
          callback(null, { stdout: "TestNet:75:6:WPA2:*", stderr: "" }, "");
        } else if (cmd.includes("connection show")) {
          // isNetworkSaved calls
          callback(null, { stdout: "TestNet\n", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.connect("TestNet", "pass");

      expect(result.success).toBe(true);
      expect(result.message).toContain("Already connected");
    });

    it("should successfully connect with password", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        // Handle "which nmcli" calls
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          // nmcli device wifi connect command
          callback(null, { stdout: "Connection activated", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.connect("TestNet", "password123");

      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.message).toContain("Connected to TestNet");
    });

    it("should successfully connect without password", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        // Handle "which nmcli" calls
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          // nmcli device wifi connect command
          callback(null, { stdout: "Connection activated", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.connect("OpenNet");

      expect(result.success).toBe(true);
    });

    it("should throw INVALID_PASSWORD on wrong password", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          // nmcli connect command fails with password error
          callback(new Error("Secrets were required"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.connect("TestNet", "wrong");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.INVALID_PASSWORD);
      }
      expect(caught).toBe(true);
    });

    it("should throw NETWORK_NOT_FOUND when network doesn't exist", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          // nmcli connect command fails with network not found
          callback(new Error("No network with SSID"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.connect("NonExistent");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NETWORK_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should throw CONNECTION_FAILED on other errors", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        if (cmd === "which nmcli") {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (cmd === "nmcli device status") {
          callback(null, { stdout: "wlan0  wifi  disconnected", stderr: "" }, "");
        } else if (cmd === "nmcli radio wifi") {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (cmd.includes("connection show --active")) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          // nmcli connect command fails with unknown error
          callback(new Error("Unknown error"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.connect("TestNet");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.CONNECTION_FAILED);
      }
      expect(caught).toBe(true);
    });
  });

  describe("disconnect", () => {
    it("should throw NMCLI_NOT_FOUND when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.disconnect();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should return success when not connected", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 3) {
          callback(null, { stdout: ["", "wlan0  wifi", "enabled"][callCount - 1], stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.disconnect();

      expect(result.success).toBe(true);
      expect(result.message).toContain("No active WiFi connection");
    });

    it("should successfully disconnect", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 3) {
          callback(null, { stdout: ["", "wlan0  wifi", "enabled"][callCount - 1], stderr: "" }, "");
        } else if (callCount === 4) {
          callback(null, { stdout: "TestNet:802-11-wireless:wlan0", stderr: "" }, "");
        } else if (callCount === 5) {
          callback(null, { stdout: "802-11-wireless.ssid:TestNet", stderr: "" }, "");
        } else if (callCount === 6) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 7) {
          callback(null, { stdout: "TestNet:802-11-wireless:wlan0", stderr: "" }, "");
        } else {
          callback(null, { stdout: "Disconnected", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.disconnect();

      expect(result.success).toBe(true);
      expect(result.connected).toBe(false);
    });

    it("should return success when no active connection found in list", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 6) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "Wired:802-3-ethernet:eth0", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.disconnect();

      expect(result.success).toBe(true);
      expect(result.message).toContain("No active WiFi connection");
    });

    it("should throw CONNECTION_FAILED on disconnect error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        // disconnect() -> checkNmcliAvailable -> which nmcli
        if (callCount === 1) {
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (callCount === 2) {
          // getStatus -> isWiFiSupported -> which nmcli
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (callCount === 3) {
          // getStatus -> isWiFiSupported -> nmcli device status
          callback(null, { stdout: "wlan0  wifi  connected", stderr: "" }, "");
        } else if (callCount === 4) {
          // getStatus -> nmcli radio wifi
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else if (callCount === 5) {
          // getStatus -> nmcli connection show --active
          callback(null, { stdout: "TestNet:802-11-wireless:wlan0", stderr: "" }, "");
        } else if (callCount === 6) {
          // getStatus -> nmcli connection show "TestNet"
          callback(null, { stdout: "802-11-wireless.ssid:TestNet", stderr: "" }, "");
        } else if (callCount === 7) {
          // getStatus -> scanNetworks -> which nmcli
          callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
        } else if (callCount === 8) {
          // getStatus -> scanNetworks -> device wifi list
          callback(null, { stdout: "TestNet:75:6:WPA2:*", stderr: "" }, "");
        } else if (callCount === 9) {
          // getStatus -> scanNetworks -> isNetworkSaved
          callback(null, { stdout: "TestNet\n", stderr: "" }, "");
        } else if (callCount === 10) {
          // disconnect() -> nmcli connection show --active (to get connection name)
          callback(null, { stdout: "TestNet:802-11-wireless:wlan0", stderr: "" }, "");
        } else {
          // disconnect() -> nmcli connection down command fails
          callback(new Error("disconnect failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.disconnect();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.CONNECTION_FAILED);
      }
      expect(caught).toBe(true);
    });
  });

  describe("setEnabled", () => {
    it("should throw NMCLI_NOT_FOUND when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.setEnabled(true);
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should successfully enable WiFi", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1 || callCount === 2 || callCount === 3 || callCount === 4) {
          const responses = ["", "", "", "wlan0  wifi"];
          callback(null, { stdout: responses[callCount - 1], stderr: "" }, "");
        } else if (callCount === 5) {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.setEnabled(true);

      expect(status.enabled).toBe(true);
    });

    it("should successfully disable WiFi", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount <= 4) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 5) {
          callback(null, { stdout: "disabled", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const status = await wifiService.setEnabled(false);

      expect(status.enabled).toBe(false);
    });

    it("should throw PERMISSION_DENIED on error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(new Error("Permission denied"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.setEnabled(true);
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.PERMISSION_DENIED);
      }
      expect(caught).toBe(true);
    });
  });

  describe("isEnabled", () => {
    it("should return false when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      const result = await wifiService.isEnabled();

      expect(result).toBe(false);
    });

    it("should return true when enabled", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "enabled", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isEnabled();

      expect(result).toBe(true);
    });

    it("should return false when disabled", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "disabled", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isEnabled();

      expect(result).toBe(false);
    });

    it("should return false on error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(new Error("error"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.isEnabled();

      expect(result).toBe(false);
    });
  });

  describe("forgetNetwork", () => {
    it("should throw NMCLI_NOT_FOUND when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.forgetNetwork("TestNet");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should return true when network not saved", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "OtherNet\n", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.forgetNetwork("TestNet");

      expect(result).toBe(true);
    });

    it("should successfully forget saved network", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 2) {
          callback(null, { stdout: "TestNet\nOtherNet\n", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const result = await wifiService.forgetNetwork("TestNet");

      expect(result).toBe(true);
    });

    it("should throw CONNECTION_FAILED on delete error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 2) {
          callback(null, { stdout: "TestNet\n", stderr: "" }, "");
        } else {
          callback(new Error("delete failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.forgetNetwork("TestNet");
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.CONNECTION_FAILED);
      }
      expect(caught).toBe(true);
    });
  });

  describe("getSavedNetworks", () => {
    it("should throw NMCLI_NOT_FOUND when nmcli unavailable", async () => {
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callback(new Error("not found"), { stdout: "", stderr: "" }, "");
        return {} as any;
      });

      let caught = false;
      try {
        await wifiService.getSavedNetworks();
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(WiFiError);
        expect((error as WiFiError).code).toBe(WiFiErrorCode.NMCLI_NOT_FOUND);
      }
      expect(caught).toBe(true);
    });

    it("should return empty array when no WiFi networks", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "Wired:802-3-ethernet\n", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.getSavedNetworks();

      expect(networks).toEqual([]);
    });

    it("should return saved networks in range", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 2) {
          callback(null, { stdout: "Net1:802-11-wireless\nNet2:802-11-wireless\n", stderr: "" }, "");
        } else if (callCount === 3) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 4) {
          callback(null, { stdout: "Net1:85:6:WPA2:*\nNet2:65:36:WPA3::", stderr: "" }, "");
        } else {
          // isNetworkSaved calls for Net1 and Net2
          callback(null, { stdout: "Net1\nNet2\n", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.getSavedNetworks();

      expect(networks).toHaveLength(2);
      expect(networks[0].ssid).toBe("Net1");
      expect(networks[0].saved).toBe(true);
      expect(networks[1].ssid).toBe("Net2");
      expect(networks[1].saved).toBe(true);
    });

    it("should include saved networks not in range", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else if (callCount === 2) {
          callback(null, { stdout: "SavedNet:802-11-wireless\n", stderr: "" }, "");
        } else if (callCount === 3) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(null, { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.getSavedNetworks();

      expect(networks).toHaveLength(1);
      expect(networks[0].ssid).toBe("SavedNet");
      expect(networks[0].signalStrength).toBe(0);
      expect(networks[0].frequency).toBe("Unknown");
      expect(networks[0].saved).toBe(true);
    });

    it("should return empty array on error", async () => {
      let callCount = 0;
      mockExec.mockImplementation(( cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: "", stderr: "" }, "");
        } else {
          callback(new Error("failed"), { stdout: "", stderr: "" }, "");
        }
        return {} as any;
      });

      const networks = await wifiService.getSavedNetworks();

      expect(networks).toEqual([]);
    });
  });

  describe("Additional Edge Cases for Branch Coverage", () => {
    describe("Security Type Parsing", () => {
      it("should handle '--' security as OPEN", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "OpenNetwork:75:36:--:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks[0].security).toBe(WiFiSecurityType.OPEN);
      });

      it("should handle empty string security as OPEN", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "OpenNetwork:75:36::*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks[0].security).toBe(WiFiSecurityType.OPEN);
      });

      it("should handle WEP security", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "WEPNetwork:75:36:WEP:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks[0].security).toBe(WiFiSecurityType.WEP);
      });

      it("should handle OWE security", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "OWENetwork:75:36:OWE:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks[0].security).toBe(WiFiSecurityType.OWE);
      });
    });

    describe("Signal Strength Edge Cases", () => {
      it("should default to 0 for invalid signal strength", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "TestNetwork:invalid:36:WPA2:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks[0].signalStrength).toBe(0);
      });
    });

    describe("Hidden Networks", () => {
      it("should skip hidden networks with empty SSID", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: ":75:36:WPA2:*\nVisibleNetwork:80:36:WPA2:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks).toHaveLength(1);
        expect(networks[0].ssid).toBe("VisibleNetwork");
      });

      it("should skip networks with whitespace-only SSID", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, {
              stdout: "   :75:36:WPA2:*\nVisibleNetwork:80:36:WPA2:*",
              stderr: ""
            }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, { stdout: "", stderr: "" }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const networks = await wifiService.scanNetworks(false);
        expect(networks).toHaveLength(1);
        expect(networks[0].ssid).toBe("VisibleNetwork");
      });
    });


    describe("Additional getStatus Edge Cases", () => {
      it("should handle undefined IP address when no IP4.ADDRESS", async () => {
        mockExec.mockImplementation((cmd: string, callback: (error: Error | null, result: {stdout: string; stderr: string}, output: string) => void) => {
          if (cmd === "which nmcli") {
            callback(null, { stdout: "/usr/bin/nmcli", stderr: "" }, "");
          } else if (cmd.includes("device status")) {
            callback(null, { stdout: "wlan0  wifi  connected", stderr: "" }, "");
          } else if (cmd.includes("radio wifi")) {
            callback(null, { stdout: "enabled", stderr: "" }, "");
          } else if (cmd.includes("connection show --active")) {
            callback(null, { stdout: "MyNetwork:uuid:802-11-wireless:wlan0", stderr: "" }, "");
          } else if (cmd.includes("device show")) {
            callback(null, { stdout: "GENERAL.HWADDR:AA:BB:CC:DD:EE:FF", stderr: "" }, "");
          } else if (cmd.includes("device wifi list")) {
            callback(null, { stdout: "MyNetwork:85:36:WPA2:*", stderr: "" }, "");
          } else if (cmd.includes("connection show")) {
            callback(null, {
              stdout: "802-11-wireless.ssid:MyNetwork",
              stderr: ""
            }, "");
          } else {
            callback(null, { stdout: "", stderr: "" }, "");
          }
          return {} as any;
        });

        const status = await wifiService.getStatus();
        expect(status.ipAddress).toBeUndefined();
      });
    });
  });
});
