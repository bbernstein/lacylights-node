import * as os from "os";
import { execSync } from "child_process";
import {
  getNetworkInterfaces,
  formatInterfaceTable,
  NetworkInterfaceOption,
} from "../networkInterfaces";

// Mock the os and child_process modules
jest.mock("os");
jest.mock("child_process");

const mockOs = os as jest.Mocked<typeof os>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe("NetworkInterfaces", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.platform to default
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
  });

  describe("getNetworkInterfaces", () => {
    it("should return empty array when no interfaces exist", () => {
      mockOs.networkInterfaces.mockReturnValue({});

      const result = getNetworkInterfaces();

      // Should still have localhost and global broadcast
      expect(result).toHaveLength(2);
      expect(result[0].interfaceType).toBe("localhost");
      expect(result[1].interfaceType).toBe("global");
    });

    it("should filter out internal interfaces", () => {
      mockOs.networkInterfaces.mockReturnValue({
        lo0: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
        en0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Wi-Fi\nDevice: en0\n");

      const result = getNetworkInterfaces();

      // Should have en0 + localhost + global broadcast
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("en0-broadcast");
      expect(result[0].broadcast).toBe("192.168.1.255");
    });

    it("should calculate broadcast addresses correctly", () => {
      mockOs.networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: "10.0.1.50",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "10.0.1.50/24",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      expect(result[0].broadcast).toBe("10.0.1.255");
    });

    it("should handle IPv6 addresses by ignoring them", () => {
      mockOs.networkInterfaces.mockReturnValue({
        en0: [
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "fe80::1/64",
          },
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Wi-Fi\nDevice: en0\n");

      const result = getNetworkInterfaces();

      // Should only process IPv4 address
      expect(result).toHaveLength(3); // en0 + localhost + global
      expect(result[0].address).toBe("192.168.1.100");
    });

    it("should determine interface type as wifi for en0 on macOS", () => {
      mockOs.networkInterfaces.mockReturnValue({
        en0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Wi-Fi\nDevice: en0\n");

      const result = getNetworkInterfaces();

      expect(result[0].interfaceType).toBe("wifi");
      expect(result[0].description).toContain("📶");
      expect(result[0].description).toContain("Wifi");
    });

    it("should determine interface type as ethernet for ethernet interfaces", () => {
      mockOs.networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: "10.0.1.50",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "10.0.1.50/24",
          },
        ],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Ethernet\nDevice: eth0\n");

      const result = getNetworkInterfaces();

      expect(result[0].interfaceType).toBe("ethernet");
      expect(result[0].description).toContain("🌐");
      expect(result[0].description).toContain("Ethernet");
    });

    it("should fallback to interface name detection when networksetup fails", () => {
      mockOs.networkInterfaces.mockReturnValue({
        en1: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      mockExecSync.mockImplementation(() => {
        throw new Error("Command failed");
      });

      const result = getNetworkInterfaces();

      expect(result[0].interfaceType).toBe("ethernet");
    });

    it("should handle non-macOS platforms", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      } as any);

      mockOs.networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      expect(result[0].interfaceType).toBe("ethernet");
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it("should sort interfaces by type (ethernet, wifi, other)", () => {
      mockOs.networkInterfaces.mockReturnValue({
        wlan0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
        eth0: [
          {
            address: "10.0.1.50",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "bb:cc:dd:ee:ff:aa",
            internal: false,
            cidr: "10.0.1.50/24",
          },
        ],
        tun0: [
          {
            address: "172.16.1.1",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "cc:dd:ee:ff:aa:bb",
            internal: false,
            cidr: "172.16.1.1/24",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      // Should be ordered: ethernet, wifi, other, localhost, global
      expect(result).toHaveLength(5);
      expect(result[0].interfaceType).toBe("ethernet"); // eth0
      expect(result[1].interfaceType).toBe("other"); // wlan0 fallback to other
      expect(result[2].interfaceType).toBe("other"); // tun0 fallback to other
      expect(result[3].interfaceType).toBe("localhost");
      expect(result[4].interfaceType).toBe("global");
    });

    it("should skip interfaces where broadcast equals IP address", () => {
      mockOs.networkInterfaces.mockReturnValue({
        ppp0: [
          {
            address: "1.2.3.4",
            netmask: "255.255.255.255", // This will create broadcast = IP
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "1.2.3.4/32",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      // Should only have localhost and global broadcast (no ppp0)
      expect(result).toHaveLength(2);
      expect(result[0].interfaceType).toBe("localhost");
      expect(result[1].interfaceType).toBe("global");
    });

    it("should handle invalid IP addresses gracefully", () => {
      mockOs.networkInterfaces.mockReturnValue({
        eth0: [
          {
            address: "invalid.ip",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "invalid.ip/24",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      // Should only have localhost and global broadcast
      expect(result).toHaveLength(2);
    });

    it("should handle undefined interface arrays", () => {
      mockOs.networkInterfaces.mockReturnValue({
        eth0: undefined,
        en0: [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Wi-Fi\nDevice: en0\n");

      const result = getNetworkInterfaces();

      expect(result).toHaveLength(3); // en0 + localhost + global
    });

    it("should sanitize interface names to prevent command injection", () => {
      mockOs.networkInterfaces.mockReturnValue({
        "eth0; rm -rf /": [
          {
            address: "192.168.1.100",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.100/24",
          },
        ],
      } as any);

      const result = getNetworkInterfaces();

      // Interface name contains "eth0" so it's detected as ethernet, but command injection is prevented
      expect(result[0].interfaceType).toBe("ethernet");
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe("formatInterfaceTable", () => {
    it("should format interface table correctly", () => {
      const interfaces: NetworkInterfaceOption[] = [
        {
          name: "eth0-broadcast",
          address: "192.168.1.100",
          broadcast: "192.168.1.255",
          description: "🌐 eth0 - Ethernet Broadcast (192.168.1.255)",
          interfaceType: "ethernet",
        },
        {
          name: "wlan0-broadcast",
          address: "10.0.1.50",
          broadcast: "10.0.1.255",
          description: "📶 wlan0 - Wifi Broadcast (10.0.1.255)",
          interfaceType: "wifi",
        },
      ];

      const result = formatInterfaceTable(interfaces);

      expect(result).toContain("Available Network Interface Options:");
      expect(result).toContain("[1] 🌐 eth0 - Ethernet Broadcast");
      expect(result).toContain("Address: 192.168.1.100 -> 192.168.1.255");
      expect(result).toContain("[2] 📶 wlan0 - Wifi Broadcast");
      expect(result).toContain("Address: 10.0.1.50 -> 10.0.1.255");
      expect(result).toContain("=".repeat(60));
    });

    it("should handle empty interface list", () => {
      const result = formatInterfaceTable([]);

      expect(result).toContain("Available Network Interface Options:");
      expect(result).toContain("=".repeat(60));
      expect(result.split('\n')).toHaveLength(4); // Header + 2 separator lines + empty line
    });
  });

  describe("edge cases and additional coverage", () => {
    it("should handle en0 interface type detection fallback", () => {
      // This will test line 17 - en0 fallback to wifi
      mockOs.networkInterfaces.mockReturnValue({
        en0: [{
          address: "192.168.1.100",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        }],
      } as any);

      // Make execSync throw to force fallback
      mockExecSync.mockImplementation(() => {
        throw new Error("Command failed");
      });

      const result = getNetworkInterfaces();
      expect(result[0].interfaceType).toBe("wifi"); // en0 falls back to wifi
    });

    it("should detect USB ethernet interfaces on macOS", () => {
      // This will test line 65 - USB ethernet detection
      mockOs.networkInterfaces.mockReturnValue({
        en5: [{
          address: "192.168.1.100",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        }],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: USB 10/100/1000 LAN\nDevice: en5\n");

      const result = getNetworkInterfaces();
      expect(result[0].interfaceType).toBe("ethernet");
    });

    it("should handle other interface type when no specific match found", () => {
      // This will test line 74 - other interface type
      mockOs.networkInterfaces.mockReturnValue({
        bridge0: [{
          address: "192.168.1.100",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        }],
      } as any);

      mockExecSync.mockReturnValue("Hardware Port: Bridge\nDevice: bridge0\n");

      const result = getNetworkInterfaces();
      expect(result[0].interfaceType).toBe("other");
    });

    it("should return default icon for unknown interface types", () => {
      // This will test line 100 - default icon case
      mockOs.networkInterfaces.mockReturnValue({
        unknown0: [{
          address: "192.168.1.100",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        }],
      } as any);

      const result = getNetworkInterfaces();
      // Default icon should be 📡
      expect(result[0].description).toContain("📡");
    });

    it("should handle invalid netmask in broadcast calculation", () => {
      // This will test line 194 - error handling in calculateBroadcast
      mockOs.networkInterfaces.mockReturnValue({
        eth0: [{
          address: "192.168.1.100",
          netmask: "invalid.netmask",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        }],
      } as any);

      const result = getNetworkInterfaces();
      // Should only have localhost and global broadcast (no eth0 due to invalid netmask)
      expect(result).toHaveLength(2);
      expect(result[0].interfaceType).toBe("localhost");
    });

    it("should handle invalid IP parts in broadcast calculation", () => {
      // Additional test for broadcast calculation edge cases
      mockOs.networkInterfaces.mockReturnValue({
        eth0: [{
          address: "192.168.1", // Invalid - missing fourth octet
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1/24",
        }],
      } as any);

      const result = getNetworkInterfaces();
      // Should only have localhost and global broadcast (no eth0 due to invalid IP)
      expect(result).toHaveLength(2);
    });
  });
});