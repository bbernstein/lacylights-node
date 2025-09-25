import {
  selectNetworkInterface,
  saveInterfacePreference,
} from "../interfaceSelector";
import {
  getNetworkInterfaces,
  formatInterfaceTable,
} from "../networkInterfaces";
import { logger } from "../logger";

// Mock dependencies
jest.mock("../networkInterfaces");
jest.mock("../logger");
jest.mock("readline");

const mockGetNetworkInterfaces = getNetworkInterfaces as jest.MockedFunction<
  typeof getNetworkInterfaces
>;
const mockFormatInterfaceTable = formatInterfaceTable as jest.MockedFunction<
  typeof formatInterfaceTable
>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe("InterfaceSelector", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: jest.SpyInstance;

  const mockInterfaces = [
    {
      name: "eth0-broadcast",
      address: "192.168.1.100",
      broadcast: "192.168.1.255",
      description: "🌐 eth0 - Ethernet Broadcast (192.168.1.255)",
      interfaceType: "ethernet" as const,
    },
    {
      name: "wlan0-broadcast",
      address: "10.0.1.50",
      broadcast: "10.0.1.255",
      description: "📶 wlan0 - Wifi Broadcast (10.0.1.255)",
      interfaceType: "wifi" as const,
    },
  ];

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    // Reset environment variables
    delete process.env.ARTNET_BROADCAST;
    delete process.env.NON_INTERACTIVE;
    delete process.env.CI;
    delete process.env.ARTNET_ENABLED;

    // Reset process properties
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });

    // Setup default mocks
    mockGetNetworkInterfaces.mockReturnValue(mockInterfaces);
    mockFormatInterfaceTable.mockReturnValue("Formatted interface table");
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  describe("selectNetworkInterface", () => {
    describe("Environment variable handling", () => {
      it("should return existing ARTNET_BROADCAST environment variable", async () => {
        process.env.ARTNET_BROADCAST = "192.168.1.255";

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 Using Art-Net broadcast address from environment: 192.168.1.255"
        );
        expect(mockGetNetworkInterfaces).not.toHaveBeenCalled();
      });

      it("should return null when ARTNET_ENABLED is false", async () => {
        process.env.ARTNET_ENABLED = "false";

        const result = await selectNetworkInterface();

        expect(result).toBe(null);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 Art-Net is disabled, skipping interface selection"
        );
      });
    });

    describe("Non-interactive mode handling", () => {
      it("should use first interface when NON_INTERACTIVE is true", async () => {
        process.env.NON_INTERACTIVE = "true";

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 NON_INTERACTIVE environment variable detected, using first available interface broadcast address: 192.168.1.255"
        );
        expect(mockGetNetworkInterfaces).toHaveBeenCalled();
      });

      it("should use first interface when in CI environment", async () => {
        process.env.CI = "true";

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 CI environment variable detected, using first available interface broadcast address: 192.168.1.255"
        );
      });

      it("should use first interface when stdout is not a TTY", async () => {
        Object.defineProperty(process.stdout, "isTTY", {
          value: false,
          configurable: true,
        });

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 stdout redirected detected, using first available interface broadcast address: 192.168.1.255"
        );
      });

      it("should use global broadcast when no interfaces available in non-interactive mode", async () => {
        process.env.NON_INTERACTIVE = "true";
        mockGetNetworkInterfaces.mockReturnValue([]);

        const result = await selectNetworkInterface();

        expect(result).toBe("255.255.255.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 NON_INTERACTIVE environment variable detected, no network interfaces found, using default broadcast address: 255.255.255.255"
        );
      });

      it("should handle different non-interactive reasons", async () => {
        const testCases = [
          { env: "NON_INTERACTIVE", value: "true", expectedReason: "NON_INTERACTIVE environment variable" },
          { env: "CI", value: "true", expectedReason: "CI environment variable" }
        ];

        for (const testCase of testCases) {
          process.env[testCase.env] = testCase.value;
          mockGetNetworkInterfaces.mockReturnValue([]);

          const result = await selectNetworkInterface();

          expect(result).toBe("255.255.255.255");
          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining(testCase.expectedReason)
          );

          delete process.env[testCase.env];
          consoleLogSpy.mockClear();
        }
      });
    });

    describe("Interactive mode", () => {
      it("should use global broadcast when no interfaces available", async () => {
        mockGetNetworkInterfaces.mockReturnValue([]);

        const result = await selectNetworkInterface();

        expect(result).toBe("255.255.255.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "⚠️  No network interfaces found, using default broadcast"
        );
      });
    });

    describe("Error handling", () => {
      it("should handle errors during interface selection and return default", async () => {
        mockGetNetworkInterfaces.mockImplementation(() => {
          throw new Error("Network error");
        });

        const result = await selectNetworkInterface();

        expect(result).toBe("255.255.255.255");
        expect(mockLogger.error).toHaveBeenCalledWith(
          "Error during interface selection",
          { error: expect.any(Error) }
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "   Using default broadcast address: 255.255.255.255"
        );
      });

      it("should handle different error types gracefully", async () => {
        const errorTypes = [
          new Error("Network timeout"),
          new Error("Permission denied"),
          new Error("Interface not found")
        ];

        for (const error of errorTypes) {
          mockGetNetworkInterfaces.mockImplementation(() => {
            throw error;
          });

          const result = await selectNetworkInterface();

          expect(result).toBe("255.255.255.255");
          expect(mockLogger.error).toHaveBeenCalledWith(
            "Error during interface selection",
            { error }
          );

          jest.clearAllMocks();
        }
      });
    });

    describe("Interface selection logic", () => {
      it("should detect various environment conditions", async () => {
        // Test TTY detection
        Object.defineProperty(process.stdout, "isTTY", {
          value: false,
          configurable: true,
        });

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("stdout redirected detected")
        );
      });

      it("should prioritize environment variable over detection logic", async () => {
        process.env.ARTNET_BROADCAST = "10.10.10.255";
        process.env.NON_INTERACTIVE = "true"; // This should be ignored

        const result = await selectNetworkInterface();

        expect(result).toBe("10.10.10.255");
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "📡 Using Art-Net broadcast address from environment: 10.10.10.255"
        );
        expect(consoleLogSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("NON_INTERACTIVE")
        );
      });

      it("should handle single interface scenario", async () => {
        mockGetNetworkInterfaces.mockReturnValue([mockInterfaces[0]]);
        process.env.NON_INTERACTIVE = "true";

        const result = await selectNetworkInterface();

        expect(result).toBe("192.168.1.255");
        expect(mockGetNetworkInterfaces).toHaveBeenCalled();
      });
    });
  });

  describe("saveInterfacePreference", () => {
    it("should log tips for saving interface preference", () => {
      const testAddress = "192.168.1.255";

      saveInterfacePreference(testAddress);

      expect(consoleLogSpy).toHaveBeenCalledWith("\n💡 Tip: To skip this prompt next time, you can:");
      expect(consoleLogSpy).toHaveBeenCalledWith(`   1. Set ARTNET_BROADCAST=${testAddress} in your .env file`);
      expect(consoleLogSpy).toHaveBeenCalledWith(`   2. Or run: export ARTNET_BROADCAST=${testAddress}`);
      expect(consoleLogSpy).toHaveBeenCalledWith("");
    });

    it("should handle different address formats", () => {
      const testAddresses = [
        "255.255.255.255",
        "10.0.1.255",
        "172.16.1.255",
        "127.0.0.1"
      ];

      testAddresses.forEach(address => {
        saveInterfacePreference(address);

        expect(consoleLogSpy).toHaveBeenCalledWith(`   1. Set ARTNET_BROADCAST=${address} in your .env file`);
        expect(consoleLogSpy).toHaveBeenCalledWith(`   2. Or run: export ARTNET_BROADCAST=${address}`);

        consoleLogSpy.mockClear();
      });
    });

    it("should always provide consistent output format", () => {
      const address = "192.168.100.255";

      saveInterfacePreference(address);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);

      expect(calls).toContain("\n💡 Tip: To skip this prompt next time, you can:");
      expect(calls).toContain(`   1. Set ARTNET_BROADCAST=${address} in your .env file`);
      expect(calls).toContain(`   2. Or run: export ARTNET_BROADCAST=${address}`);
      expect(calls).toContain("");
    });
  });

  describe("Edge cases and boundary conditions", () => {
    it("should handle empty interface list in various modes", async () => {
      mockGetNetworkInterfaces.mockReturnValue([]);

      // Test non-interactive mode
      process.env.NON_INTERACTIVE = "true";
      const nonInteractiveResult = await selectNetworkInterface();
      expect(nonInteractiveResult).toBe("255.255.255.255");

      delete process.env.NON_INTERACTIVE;

      // Test CI mode
      process.env.CI = "true";
      const ciResult = await selectNetworkInterface();
      expect(ciResult).toBe("255.255.255.255");

      delete process.env.CI;

      // Test interactive mode
      const interactiveResult = await selectNetworkInterface();
      expect(interactiveResult).toBe("255.255.255.255");
    });

    it("should handle interface list with single interface", async () => {
      const singleInterface = [mockInterfaces[0]];
      mockGetNetworkInterfaces.mockReturnValue(singleInterface);
      process.env.NON_INTERACTIVE = "true";

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(mockGetNetworkInterfaces).toHaveBeenCalled();
    });

    it("should validate environment variable precedence", async () => {
      process.env.ARTNET_BROADCAST = "custom.broadcast.address";
      process.env.ARTNET_ENABLED = "true"; // This should not override ARTNET_BROADCAST

      const result = await selectNetworkInterface();

      expect(result).toBe("custom.broadcast.address");
      expect(mockGetNetworkInterfaces).not.toHaveBeenCalled();
    });
  });

  describe("ARTNET_ENABLED environment variable", () => {
    it("should return null when Art-Net is disabled", async () => {
      process.env.ARTNET_ENABLED = "false";

      const result = await selectNetworkInterface();

      expect(result).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith("📡 Art-Net is disabled, skipping interface selection");
      expect(mockGetNetworkInterfaces).not.toHaveBeenCalled();
    });

    it("should proceed normally when ARTNET_ENABLED is not set", async () => {
      delete process.env.ARTNET_ENABLED;
      mockGetNetworkInterfaces.mockReturnValue([]);

      const result = await selectNetworkInterface();

      expect(result).toBe("255.255.255.255");
      expect(mockGetNetworkInterfaces).toHaveBeenCalled();
    });

    it("should proceed normally when ARTNET_ENABLED is any value other than 'false'", async () => {
      const testValues = ["1", "yes", "enabled", "anything"];

      for (const value of testValues) {
        process.env.ARTNET_ENABLED = value;
        mockGetNetworkInterfaces.mockReturnValue([]);

        const result = await selectNetworkInterface();

        expect(result).toBe("255.255.255.255");
        expect(mockGetNetworkInterfaces).toHaveBeenCalled();

        mockGetNetworkInterfaces.mockClear();
      }
    });
  });

  describe("Interactive readline edge cases", () => {
    let mockRlInterface: any;

    beforeEach(() => {
      // Mock readline.createInterface
      mockRlInterface = {
        question: jest.fn(),
        close: jest.fn(),
      };

      const mockReadline = jest.requireMock("readline");
      mockReadline.createInterface = jest.fn().mockReturnValue(mockRlInterface);

      // Ensure we're in interactive mode
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      delete process.env.NON_INTERACTIVE;
      delete process.env.CI;
      delete process.env.ARTNET_ENABLED;
      delete process.env.ARTNET_BROADCAST;

      // Mock process.stdin properties
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdin, "isRaw", {
        value: false,
        configurable: true,
      });

      // Mock stdin methods
      process.stdin.removeAllListeners = jest.fn();
      process.stdin.listeners = jest.fn().mockReturnValue([]);
      process.stdin.on = jest.fn();
      process.stdin.setRawMode = jest.fn();
    });

    it("should handle user selecting first option explicitly", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("1"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Selected:"));
    });

    it("should handle user selecting second option", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("2"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("10.0.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Broadcasting to: 10.0.1.255"));
    });

    it("should handle invalid numeric input", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("999"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith("⚠️  Invalid selection, using default broadcast");
    });

    it("should handle non-numeric input", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("abc"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith("⚠️  Invalid selection, using default broadcast");
    });

    it("should handle empty input (default selection)", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback(""), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Selected:"));
    });

    it("should handle whitespace-only input", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("   "), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Selected:"));
    });

    it("should handle zero input", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("0"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith("⚠️  Invalid selection, using default broadcast");
    });

    it("should handle negative input", async () => {
      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("-1"), 10);
      });

      const result = await selectNetworkInterface();

      expect(result).toBe("192.168.1.255");
      expect(consoleLogSpy).toHaveBeenCalledWith("⚠️  Invalid selection, using default broadcast");
    });

    it("should properly restore stdin listeners", async () => {
      const mockDataListeners = [jest.fn(), jest.fn()];
      const mockKeypressListeners = [jest.fn()];

      process.stdin.listeners = jest.fn((event: string) => {
        if (event === "data") {return mockDataListeners.slice();}
        if (event === "keypress") {return mockKeypressListeners.slice();}
        return [];
      });

      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("1"), 10);
      });

      await selectNetworkInterface();

      expect(process.stdin.removeAllListeners).toHaveBeenCalledWith("data");
      expect(process.stdin.removeAllListeners).toHaveBeenCalledWith("keypress");
    });

    it("should handle raw mode restoration", async () => {
      Object.defineProperty(process.stdin, "isRaw", {
        value: true,
        configurable: true,
      });

      mockRlInterface.question.mockImplementation((prompt: string, callback: (input: string) => void) => {
        setTimeout(() => callback("1"), 10);
      });

      await selectNetworkInterface();

      expect(process.stdin.setRawMode).toHaveBeenCalledWith(false);
    });
  });
});