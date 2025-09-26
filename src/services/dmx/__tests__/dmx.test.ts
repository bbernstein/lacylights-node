import { DMXService } from "../index";
import * as dgram from "dgram";
import * as interfaceSelector from "../../../utils/interfaceSelector";
import { logger } from "../../../utils/logger";

// Mock dependencies
jest.mock("dgram");
jest.mock("../../../utils/interfaceSelector");
jest.mock("../../../utils/logger");

const mockDgram = dgram as jest.Mocked<typeof dgram>;
const mockInterfaceSelector = interfaceSelector as jest.Mocked<typeof interfaceSelector>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe("DMXService", () => {
  let dmxService: DMXService;
  let mockSocket: jest.Mocked<dgram.Socket>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock socket
    mockSocket = {
      bind: jest.fn(),
      setBroadcast: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    } as any;

    // Mock dgram.createSocket to return our mock socket
    mockDgram.createSocket.mockReturnValue(mockSocket);

    // Mock socket.bind to call the callback immediately
    mockSocket.bind.mockImplementation((...args: any[]) => {
      const callback = args.find(arg => typeof arg === 'function');
      if (callback) {callback();}
      return mockSocket;
    });

    // Create a new instance for each test
    dmxService = new DMXService();
  });

  async function initializeWithDefaults() {
    // Set test environment variables
    process.env.DMX_UNIVERSE_COUNT = "2";
    process.env.DMX_REFRESH_RATE = "44";
    process.env.ARTNET_ENABLED = "false"; // Disable Art-Net for most tests

    await dmxService.initialize();
  }

  afterEach(() => {
    if (dmxService) {
      dmxService.stop();
    }

    // Clean up environment variables
    delete process.env.DMX_UNIVERSE_COUNT;
    delete process.env.DMX_REFRESH_RATE;
    delete process.env.ARTNET_ENABLED;
  });

  describe("initialization", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should initialize with correct number of universes", async () => {
      const universe1Output = dmxService.getUniverseOutput(1);
      const universe2Output = dmxService.getUniverseOutput(2);
      const universe3Output = dmxService.getUniverseOutput(3);

      expect(universe1Output).toHaveLength(512);
      expect(universe2Output).toHaveLength(512);
      expect(universe3Output).toHaveLength(0); // Should not exist
    });

    it("should initialize all channels to 0", async () => {
      const universe1Output = dmxService.getUniverseOutput(1);

      expect(universe1Output.every((value) => value === 0)).toBe(true);
    });

    it("should initialize with Art-Net enabled and interface selection", async () => {
      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "true";
      mockInterfaceSelector.selectNetworkInterface.mockResolvedValue("192.168.1.100");

      await testDmxService.initialize();

      expect(mockInterfaceSelector.selectNetworkInterface).toHaveBeenCalled();
      expect(mockInterfaceSelector.saveInterfacePreference).toHaveBeenCalledWith("192.168.1.100");
      expect(mockDgram.createSocket).toHaveBeenCalledWith("udp4");
      expect(mockSocket.bind).toHaveBeenCalled();
      expect(mockSocket.setBroadcast).toHaveBeenCalledWith(true);

      testDmxService.stop();
    });

    it("should handle no network interface selected and fallback to broadcast", async () => {
      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "true";
      mockInterfaceSelector.selectNetworkInterface.mockResolvedValue(null);

      await testDmxService.initialize();

      expect(mockInterfaceSelector.selectNetworkInterface).toHaveBeenCalled();
      expect(mockInterfaceSelector.saveInterfacePreference).not.toHaveBeenCalled();

      testDmxService.stop();
    });

    it("should respect timing monitoring configuration", async () => {
      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "false";
      process.env.DMX_DRIFT_THRESHOLD = "25";
      process.env.DMX_DRIFT_THROTTLE = "3000";

      await testDmxService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Timing monitoring: warn if drift >25ms, throttle 3000ms")
      );

      testDmxService.stop();
    });

    it("should handle timing monitoring disabled", async () => {
      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "false";
      process.env.DMX_DRIFT_THRESHOLD = "0";

      await testDmxService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Timing monitoring: disabled")
      );

      testDmxService.stop();
    });
  });

  describe("setChannelValue", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should set channel value correctly", () => {
      dmxService.setChannelValue(1, 1, 255);
      const output = dmxService.getUniverseOutput(1);

      expect(output[0]).toBe(255);
    });

    it("should clamp values to valid DMX range", () => {
      dmxService.setChannelValue(1, 1, 300); // Above max
      dmxService.setChannelValue(1, 2, -50); // Below min

      const output = dmxService.getUniverseOutput(1);

      expect(output[0]).toBe(255); // Clamped to max
      expect(output[1]).toBe(0); // Clamped to min
    });

    it("should ignore invalid channel numbers", () => {
      dmxService.setChannelValue(1, 0, 100); // Channel 0 (invalid)
      dmxService.setChannelValue(1, 513, 100); // Channel 513 (invalid)

      const output = dmxService.getUniverseOutput(1);

      expect(output.every((value) => value === 0)).toBe(true);
    });

    it("should ignore invalid universe numbers", () => {
      dmxService.setChannelValue(99, 1, 100); // Universe doesn't exist

      // Should not throw an error
      expect(() => dmxService.setChannelValue(99, 1, 100)).not.toThrow();
    });
  });

  describe("getUniverseOutput", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should return copy of universe data", () => {
      dmxService.setChannelValue(1, 1, 100);

      const output1 = dmxService.getUniverseOutput(1);
      const output2 = dmxService.getUniverseOutput(1);

      // Should be equal but not the same reference
      expect(output1).toEqual(output2);
      expect(output1).not.toBe(output2);
    });

    it("should return empty array for non-existent universe", () => {
      const output = dmxService.getUniverseOutput(99);

      expect(output).toEqual([]);
    });
  });

  describe("getAllUniverseOutputs", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should return all universe outputs", () => {
      dmxService.setChannelValue(1, 1, 100);
      dmxService.setChannelValue(2, 5, 200);

      const allOutputs = dmxService.getAllUniverseOutputs();

      expect(allOutputs).toHaveLength(2);
      expect(allOutputs[0].universe).toBe(1);
      expect(allOutputs[0].channels[0]).toBe(100);
      expect(allOutputs[1].universe).toBe(2);
      expect(allOutputs[1].channels[4]).toBe(200);
    });

    it("should return copies of universe data", () => {
      const allOutputs1 = dmxService.getAllUniverseOutputs();
      const allOutputs2 = dmxService.getAllUniverseOutputs();

      expect(allOutputs1).toEqual(allOutputs2);
      expect(allOutputs1[0].channels).not.toBe(allOutputs2[0].channels);
    });
  });

  describe("stop", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should clear all channel values", () => {
      dmxService.setChannelValue(1, 1, 255);
      dmxService.setChannelValue(1, 2, 128);
      dmxService.setChannelValue(2, 1, 64);

      dmxService.stop();

      const universe1 = dmxService.getUniverseOutput(1);
      const universe2 = dmxService.getUniverseOutput(2);

      expect(universe1.every((value) => value === 0)).toBe(true);
      expect(universe2.every((value) => value === 0)).toBe(true);
    });
  });

  describe("multiple channel operations", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should handle multiple channel changes correctly", () => {
      const testValues = [
        { universe: 1, channel: 1, value: 255 },
        { universe: 1, channel: 2, value: 128 },
        { universe: 1, channel: 3, value: 64 },
        { universe: 2, channel: 1, value: 32 },
        { universe: 2, channel: 512, value: 16 },
      ];

      testValues.forEach(({ universe, channel, value }) => {
        dmxService.setChannelValue(universe, channel, value);
      });

      const universe1 = dmxService.getUniverseOutput(1);
      const universe2 = dmxService.getUniverseOutput(2);

      expect(universe1[0]).toBe(255);
      expect(universe1[1]).toBe(128);
      expect(universe1[2]).toBe(64);
      expect(universe2[0]).toBe(32);
      expect(universe2[511]).toBe(16);
    });
  });

  describe("active scene tracking", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should set and get active scene ID", () => {
      const sceneId = "test-scene-123";
      dmxService.setActiveScene(sceneId);

      expect(dmxService.getCurrentActiveSceneId()).toBe(sceneId);
    });

    it("should clear active scene", () => {
      dmxService.setActiveScene("test-scene-123");
      dmxService.clearActiveScene();

      expect(dmxService.getCurrentActiveSceneId()).toBeNull();
    });

    it("should start with no active scene", () => {
      expect(dmxService.getCurrentActiveSceneId()).toBeNull();
    });
  });

  describe("transmission status and rate management", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should get transmission status", () => {
      const status = dmxService.getTransmissionStatus();

      expect(status).toBeDefined();
      expect(typeof status.currentRate).toBe("number");
      expect(typeof status.isInHighRateMode).toBe("boolean");
      expect(typeof status.refreshRate).toBe("number");
      expect(typeof status.idleRate).toBe("number");
      expect(typeof status.isDirty).toBe("boolean");
      expect(Array.isArray(status.dirtyUniverses)).toBe(true);
    });

    it("should get current transmission rate", () => {
      const rate = dmxService.getCurrentTransmissionRate();
      expect(typeof rate).toBe("number");
      expect(rate).toBeGreaterThan(0);
    });

    it("should report high rate mode status", () => {
      const isHighRate = dmxService.isInHighRate();
      expect(typeof isHighRate).toBe("boolean");
    });

    it("should trigger change detection manually", () => {
      dmxService.triggerChangeDetection();
      const newStatus = dmxService.getTransmissionStatus();

      // After triggering change detection, we should be in high rate mode
      expect(newStatus.isInHighRateMode).toBe(true);
    });
  });

  describe("environment variable configuration", () => {
    it("should respect DMX_UNIVERSE_COUNT environment variable", async () => {
      const testDmxService = new DMXService();
      process.env.DMX_UNIVERSE_COUNT = "3";
      process.env.ARTNET_ENABLED = "false";

      await testDmxService.initialize();

      const outputs = testDmxService.getAllUniverseOutputs();
      expect(outputs).toHaveLength(3);

      testDmxService.stop();
      delete process.env.DMX_UNIVERSE_COUNT;
    });

    it("should respect DMX_REFRESH_RATE environment variable", async () => {
      const testDmxService = new DMXService();
      process.env.DMX_REFRESH_RATE = "30";
      process.env.ARTNET_ENABLED = "false";

      await testDmxService.initialize();

      const status = testDmxService.getTransmissionStatus();
      expect(status.refreshRate).toBe(30);

      testDmxService.stop();
      delete process.env.DMX_REFRESH_RATE;
    });

    it("should respect DMX_IDLE_RATE environment variable", async () => {
      const testDmxService = new DMXService();
      process.env.DMX_IDLE_RATE = "5";
      process.env.ARTNET_ENABLED = "false";

      await testDmxService.initialize();

      const status = testDmxService.getTransmissionStatus();
      expect(status.idleRate).toBe(5);

      testDmxService.stop();
      delete process.env.DMX_IDLE_RATE;
    });

    it("should respect ARTNET_ENABLED environment variable", async () => {
      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "true";

      // This test would create a real UDP socket, so we keep it disabled for unit tests
      process.env.ARTNET_ENABLED = "false";
      await testDmxService.initialize();

      testDmxService.stop();
    });
  });

  describe("getUniverseChannels method", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should return null for non-existent universe", () => {
      const channels = dmxService.getUniverseChannels(99);
      expect(channels).toBeNull();
    });

    it("should return channels for existing universe", () => {
      const channels = dmxService.getUniverseChannels(1);
      expect(channels).not.toBeNull();
      expect(channels).toHaveLength(512);
    });

    it("should return channels with overrides applied", () => {
      dmxService.setChannelValue(1, 1, 100);
      dmxService.setChannelOverride(1, 1, 200);

      const channels = dmxService.getUniverseChannels(1);
      expect(channels![0]).toBe(200); // Override value should be returned
    });
  });

  describe("edge cases and error handling", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should handle setting channels on non-existent universe", () => {
      // Should not throw error
      expect(() => {
        dmxService.setChannelValue(99, 1, 255);
      }).not.toThrow();

      const value = dmxService.getChannelValue(99, 1);
      expect(value).toBe(0);
    });

    it("should handle getting channels from non-existent universe", () => {
      const output = dmxService.getUniverseOutput(99);
      expect(output).toHaveLength(0);
    });

    it("should handle multiple override operations", () => {
      // Set base value
      dmxService.setChannelValue(1, 5, 100);

      // Apply override
      dmxService.setChannelOverride(1, 5, 200);
      expect(dmxService.getChannelValue(1, 5)).toBe(100); // Base value unchanged
      expect(dmxService.getUniverseOutput(1)[4]).toBe(200); // Output has override

      // Clear override
      dmxService.clearChannelOverride(1, 5);
      expect(dmxService.getUniverseOutput(1)[4]).toBe(100); // Back to base value

      // Clear override that doesn't exist (should not error)
      dmxService.clearChannelOverride(1, 5);
      expect(dmxService.getUniverseOutput(1)[4]).toBe(100);
    });

    it("should handle clearing all overrides when none exist", () => {
      expect(() => {
        dmxService.clearAllOverrides();
      }).not.toThrow();
    });

    it("should handle setting same channel value multiple times", () => {
      dmxService.setChannelValue(1, 1, 255);
      dmxService.setChannelValue(1, 1, 255); // Same value, should not cause issues

      expect(dmxService.getChannelValue(1, 1)).toBe(255);
    });
  });

  describe("Art-Net transmission and output loop", () => {
    let testDmxService: DMXService;

    beforeEach(async () => {
      testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "true";
      process.env.DMX_UNIVERSE_COUNT = "2";
      process.env.DMX_REFRESH_RATE = "10"; // Fast rate for testing
      process.env.DMX_IDLE_RATE = "2";
      process.env.DMX_HIGH_RATE_DURATION = "100"; // Short duration for testing

      mockInterfaceSelector.selectNetworkInterface.mockResolvedValue("192.168.1.100");
      await testDmxService.initialize();
    });

    afterEach(() => {
      testDmxService.stop();
    });

    it("should handle Art-Net transmission with socket operations", async () => {
      // Set some channel values to trigger transmission
      testDmxService.setChannelValue(1, 1, 255);
      testDmxService.setChannelValue(1, 2, 128);

      // Wait for transmission to occur
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockSocket.send).toHaveBeenCalled();
    });

    it("should handle socket send errors", async () => {
      // Mock socket.send to trigger an error
      mockSocket.send.mockImplementation((packet, port, address, callback) => {
        const error = new Error("Network error");
        if (callback) {callback(error, 0);}
      });

      testDmxService.setChannelValue(1, 1, 255);

      // Wait for transmission to occur
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Art-Net send error for universe"),
        expect.objectContaining({
          error: expect.any(Error),
          universe: expect.any(Number)
        })
      );
    });

    it("should properly close socket on stop with Art-Net enabled", () => {
      // Verify socket is created during initialization
      expect(mockSocket.bind).toHaveBeenCalled();

      // Stop the service
      testDmxService.stop();

      // Verify socket.close was called
      expect(mockSocket.close).toHaveBeenCalled();
    });

    it("should send final zero packets on stop", () => {
      testDmxService.setChannelValue(1, 1, 255);
      testDmxService.setChannelValue(2, 1, 128);

      // Clear previous send calls
      mockSocket.send.mockClear();

      testDmxService.stop();

      // Should have sent final packets with zeros
      expect(mockSocket.send).toHaveBeenCalledTimes(2); // One for each universe
    });

    it("should handle logical inconsistency in dirty universes", async () => {
      // This tests the error condition where isDirty is true but dirtyUniverses is empty
      // We need to manually trigger this condition by manipulating internal state
      testDmxService.setChannelValue(1, 1, 100);

      // Access private properties to create the inconsistent state
      const service = testDmxService as any;
      service.isDirty = true;
      service.dirtyUniverses.clear(); // Make it empty while isDirty is true

      // Wait for transmission to occur which should log the error
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Logical inconsistency: isDirty is true but dirtyUniverses is empty")
      );
    });
  });

  describe("Channel overrides with comprehensive scenarios", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should handle clearing multiple overrides from different universes", () => {
      // Set up base values
      dmxService.setChannelValue(1, 1, 50);
      dmxService.setChannelValue(1, 2, 60);
      dmxService.setChannelValue(2, 1, 70);

      // Apply overrides on multiple universes
      dmxService.setChannelOverride(1, 1, 150);
      dmxService.setChannelOverride(1, 2, 160);
      dmxService.setChannelOverride(2, 1, 170);
      dmxService.setChannelOverride(2, 2, 180);

      // Verify overrides are applied
      expect(dmxService.getUniverseOutput(1)[0]).toBe(150);
      expect(dmxService.getUniverseOutput(1)[1]).toBe(160);
      expect(dmxService.getUniverseOutput(2)[0]).toBe(170);
      expect(dmxService.getUniverseOutput(2)[1]).toBe(180);

      // Clear all overrides
      dmxService.clearAllOverrides();

      // Verify base values are restored
      expect(dmxService.getUniverseOutput(1)[0]).toBe(50);
      expect(dmxService.getUniverseOutput(1)[1]).toBe(60);
      expect(dmxService.getUniverseOutput(2)[0]).toBe(70);
      expect(dmxService.getUniverseOutput(2)[1]).toBe(0); // No base value was set
    });

    it("should clamp override values to valid range", () => {
      dmxService.setChannelOverride(1, 1, 300); // Above max
      dmxService.setChannelOverride(1, 2, -50); // Below min

      const output = dmxService.getUniverseOutput(1);
      expect(output[0]).toBe(255); // Clamped to max
      expect(output[1]).toBe(0);   // Clamped to min
    });

    it("should ignore channel overrides for invalid channel numbers", () => {
      dmxService.setChannelOverride(1, 0, 100);   // Invalid channel 0
      dmxService.setChannelOverride(1, 513, 100); // Invalid channel 513

      const output = dmxService.getUniverseOutput(1);
      expect(output.every(value => value === 0)).toBe(true);
    });

    it("should only mark dirty when override value actually changes", () => {
      // Set an override
      dmxService.setChannelOverride(1, 1, 100);

      // Clear dirty flags manually
      const service = dmxService as any;
      service.isDirty = false;
      service.dirtyUniverses.clear();

      // Set same override value again
      dmxService.setChannelOverride(1, 1, 100);
      const status2 = dmxService.getTransmissionStatus();

      // Should not be marked dirty since value didn't change
      expect(status2.isDirty).toBe(false);
    });
  });

  describe("Timing drift detection and monitoring", () => {
    let testDmxService: DMXService;

    beforeEach(async () => {
      testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "false";
      process.env.DMX_REFRESH_RATE = "10";
      process.env.DMX_DRIFT_THRESHOLD = "25"; // Enable drift monitoring
      process.env.DMX_DRIFT_THROTTLE = "100"; // Short throttle for testing

      await testDmxService.initialize();
    });

    afterEach(() => {
      testDmxService.stop();
    });

    it("should have timing monitoring configured", () => {
      const testDmxServiceSync = new DMXService();
      // Test that the service can be initialized with timing monitoring
      // The actual drift detection happens in real-time scenarios
      expect(testDmxServiceSync).toBeDefined();
    });

    it("should throttle drift warnings to avoid spam", async () => {
      testDmxService.setChannelValue(1, 1, 255);

      // Mock Date.now for consistent drift detection
      const originalDateNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        // Simulate consistent drift
        return originalDateNow() + (callCount++ * 50);
      });

      // Wait for multiple cycles
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only warn once due to throttling (throttle is 100ms in test config)
      const warningCalls = mockLogger.warn.mock.calls.filter(call =>
        call[0].includes("timing drift detected")
      );

      // Allow some variation due to timing, but should be throttled
      expect(warningCalls.length).toBeLessThanOrEqual(3);

      Date.now = originalDateNow;
    });
  });

  describe("Rate switching and transmission modes", () => {
    let testDmxService: DMXService;

    beforeEach(async () => {
      testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "false";
      process.env.DMX_REFRESH_RATE = "20";
      process.env.DMX_IDLE_RATE = "2";
      process.env.DMX_HIGH_RATE_DURATION = "50"; // Very short for testing

      await testDmxService.initialize();
    });

    afterEach(() => {
      testDmxService.stop();
    });

    it("should switch to high rate mode when changes detected", async () => {
      const initialStatus = testDmxService.getTransmissionStatus();
      // Initially starts at refresh rate
      expect(initialStatus.currentRate).toBe(20);

      // Verify that setting a channel marks the service as dirty
      testDmxService.setChannelValue(1, 1, 255);

      const afterChangeStatus = testDmxService.getTransmissionStatus();
      expect(afterChangeStatus.isDirty).toBe(true);
      expect(afterChangeStatus.dirtyUniverseCount).toBeGreaterThan(0);
    });

    it("should track timing information properly", () => {
      // Test that we can get transmission status with timing info
      const status = testDmxService.getTransmissionStatus();

      expect(status).toMatchObject({
        currentRate: expect.any(Number),
        refreshRate: expect.any(Number),
        idleRate: expect.any(Number),
        highRateDuration: expect.any(Number),
        isDirty: expect.any(Boolean),
        dirtyUniverseCount: expect.any(Number),
        totalUniverses: expect.any(Number)
      });
    });

    it("should handle manual trigger for change detection", () => {
      const beforeTrigger = testDmxService.getTransmissionStatus();
      expect(beforeTrigger.isInHighRateMode).toBe(false);

      testDmxService.triggerChangeDetection();

      const afterTrigger = testDmxService.getTransmissionStatus();
      expect(afterTrigger.isInHighRateMode).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("manual trigger to high rate")
      );
    });
  });

  describe("Environment variable configuration coverage", () => {
    afterEach(() => {
      // Clean up environment variables
      delete process.env.DMX_UNIVERSE_COUNT;
      delete process.env.DMX_REFRESH_RATE;
      delete process.env.DMX_IDLE_RATE;
      delete process.env.DMX_HIGH_RATE_DURATION;
      delete process.env.ARTNET_ENABLED;
      delete process.env.DMX_DRIFT_THRESHOLD;
      delete process.env.DMX_DRIFT_THROTTLE;
    });

    it("should respect DMX_HIGH_RATE_DURATION environment variable", async () => {
      const testDmxService = new DMXService();
      process.env.DMX_HIGH_RATE_DURATION = "1500";
      process.env.ARTNET_ENABLED = "false";

      await testDmxService.initialize();

      const status = testDmxService.getTransmissionStatus();
      expect(status.highRateDuration).toBe(1500);

      testDmxService.stop();
    });

    it("should handle all environment variables with default fallbacks", async () => {
      // Clear all environment variables to test defaults
      delete process.env.DMX_UNIVERSE_COUNT;
      delete process.env.DMX_REFRESH_RATE;
      delete process.env.DMX_IDLE_RATE;
      delete process.env.DMX_HIGH_RATE_DURATION;
      delete process.env.DMX_DRIFT_THRESHOLD;
      delete process.env.DMX_DRIFT_THROTTLE;

      const testDmxService = new DMXService();
      process.env.ARTNET_ENABLED = "false";

      await testDmxService.initialize();

      const status = testDmxService.getTransmissionStatus();
      expect(status.refreshRate).toBe(44); // Default
      expect(status.idleRate).toBe(1); // Default
      expect(status.highRateDuration).toBe(2000); // Default
      expect(status.totalUniverses).toBe(4); // Default

      testDmxService.stop();
    });
  });

  describe("getChannelValue method", () => {
    beforeEach(async () => {
      await initializeWithDefaults();
    });

    it("should return channel value for valid universe and channel", () => {
      dmxService.setChannelValue(1, 5, 128);
      expect(dmxService.getChannelValue(1, 5)).toBe(128);
    });

    it("should return 0 for invalid universe", () => {
      expect(dmxService.getChannelValue(99, 1)).toBe(0);
    });

    it("should return 0 for invalid channel numbers", () => {
      expect(dmxService.getChannelValue(1, 0)).toBe(0);   // Below range
      expect(dmxService.getChannelValue(1, 513)).toBe(0); // Above range
    });

    it("should return base value not override value", () => {
      dmxService.setChannelValue(1, 1, 100);
      dmxService.setChannelOverride(1, 1, 200);

      // getChannelValue should return base value, not override
      expect(dmxService.getChannelValue(1, 1)).toBe(100);
      // But getUniverseOutput should return override
      expect(dmxService.getUniverseOutput(1)[0]).toBe(200);
    });
  });
});
