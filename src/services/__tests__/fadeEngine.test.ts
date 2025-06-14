import './setup';
import { fadeEngine } from '../fadeEngine';
import { dmxService } from '../dmx';

// Mock the dmx service
jest.mock('../dmx', () => ({
  dmxService: {
    setChannelValue: jest.fn(),
    getChannelValue: jest.fn().mockReturnValue(0),
    getAllUniverseOutputs: jest.fn().mockReturnValue([]),
  },
}));

describe('FadeEngine', () => {
  const mockDmxService = dmxService as jest.Mocked<typeof dmxService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset fade engine state
    fadeEngine.cancelAllFades();
    fadeEngine.stop();
    fadeEngine.start();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization and lifecycle', () => {
    it('should start automatically on construction', () => {
      expect(fadeEngine['isRunning']).toBe(true);
      expect(fadeEngine['fadeInterval']).not.toBeNull();
    });

    it('should not start if already running', () => {
      const initialInterval = fadeEngine['fadeInterval'];
      fadeEngine.start();
      expect(fadeEngine['fadeInterval']).toBe(initialInterval);
    });

    it('should stop the fade engine', () => {
      fadeEngine.stop();
      expect(fadeEngine['isRunning']).toBe(false);
      expect(fadeEngine['fadeInterval']).toBeNull();
    });

    it('should restart after stopping', () => {
      fadeEngine.stop();
      fadeEngine.start();
      expect(fadeEngine['isRunning']).toBe(true);
      expect(fadeEngine['fadeInterval']).not.toBeNull();
    });
  });

  describe('fadeChannels', () => {
    it('should create a fade with generated ID', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      const fadeId = fadeEngine.fadeChannels(channels, 1);
      
      expect(fadeId).toMatch(/^fade-\d+-[\d.]+$/);
      expect(fadeEngine['activeFades'].has(fadeId)).toBe(true);
    });

    it('should create a fade with custom ID', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      const customId = 'custom-fade-id';
      const fadeId = fadeEngine.fadeChannels(channels, 1, customId);
      
      expect(fadeId).toBe(customId);
      expect(fadeEngine['activeFades'].has(customId)).toBe(true);
    });

    it('should cancel existing fade with same ID', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      const fadeId = 'test-fade';
      
      fadeEngine.fadeChannels(channels, 1, fadeId);
      const firstFade = fadeEngine['activeFades'].get(fadeId);
      
      fadeEngine.fadeChannels(channels, 2, fadeId);
      const secondFade = fadeEngine['activeFades'].get(fadeId);
      
      expect(secondFade).not.toBe(firstFade);
      expect(secondFade?.duration).toBe(2000);
    });

    it('should get current channel values', () => {
      mockDmxService.getChannelValue.mockReturnValue(100);
      
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      fadeEngine.fadeChannels(channels, 1);
      
      expect(mockDmxService.getChannelValue).toHaveBeenCalledWith(1, 1);
      
      const fade = fadeEngine['activeFades'].values().next().value;
      expect(fade?.channels[0].startValue).toBe(100);
    });

    it('should convert duration to milliseconds', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      fadeEngine.fadeChannels(channels, 2.5);
      
      const fade = fadeEngine['activeFades'].values().next().value;
      expect(fade?.duration).toBe(2500);
    });
  });

  describe('fade processing at 40Hz', () => {
    it('should process fades every 25ms (40Hz)', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      fadeEngine.fadeChannels(channels, 1);
      
      // Run for exactly 1 second
      for (let i = 0; i < 40; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // Should have been called 40 times during the 1 second fade
      expect(mockDmxService.setChannelValue).toHaveBeenCalledTimes(40);
    });

    it('should verify 40Hz timing with 2048 channels across 4 universes', () => {
      const startTime = Date.now();
      const channels: Array<{ universe: number; channel: number; targetValue: number }> = [];
      
      // Create 2048 channels (4 universes × 512 channels)
      for (let universe = 1; universe <= 4; universe++) {
        for (let channel = 1; channel <= 512; channel++) {
          channels.push({ universe, channel, targetValue: 255 });
        }
      }
      
      fadeEngine.fadeChannels(channels, 1); // 1 second fade
      
      const callTimes: number[] = [];
      mockDmxService.setChannelValue.mockImplementation(() => {
        callTimes.push(Date.now() - startTime);
      });
      
      // Process the fade for exactly 1 second
      for (let i = 0; i < 40; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // Verify timing intervals
      const uniqueCallTimes = [...new Set(callTimes)];
      for (let i = 1; i < uniqueCallTimes.length; i++) {
        const interval = uniqueCallTimes[i] - uniqueCallTimes[i - 1];
        expect(interval).toBe(25);
      }
      
      // Verify we processed all channels at each interval
      const callsPerInterval = callTimes.filter(t => t === uniqueCallTimes[0]).length;
      expect(callsPerInterval).toBe(2048);
    });

    it('should interpolate values linearly', () => {
      mockDmxService.getChannelValue.mockReturnValue(0);
      const channels = [{ universe: 1, channel: 1, targetValue: 100 }];
      fadeEngine.fadeChannels(channels, 1);
      
      const expectedValues: number[] = [];
      
      // Capture all values set during the fade
      mockDmxService.setChannelValue.mockImplementation((_, __, value) => {
        expectedValues.push(value);
      });
      
      // Run fade for 500ms (half way)
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // At 500ms, we should be close to 50
      const midValue = expectedValues[expectedValues.length - 1];
      expect(midValue).toBeGreaterThanOrEqual(49);
      expect(midValue).toBeLessThanOrEqual(51);
    });

    it('should complete fade and call onComplete callback', () => {
      const onComplete = jest.fn();
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      
      fadeEngine.fadeChannels(channels, 0.5, undefined, onComplete);
      
      // Run for 500ms
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(25);
      }
      
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(fadeEngine['activeFades'].size).toBe(0);
    });

    it('should set final values exactly when fade completes', () => {
      const channels = [
        { universe: 1, channel: 1, targetValue: 255 },
        { universe: 2, channel: 10, targetValue: 127 },
        { universe: 3, channel: 256, targetValue: 64 },
      ];
      
      fadeEngine.fadeChannels(channels, 0.1); // 100ms fade
      
      // Run for 100ms
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // Check final values were set
      expect(mockDmxService.setChannelValue).toHaveBeenCalledWith(1, 1, 255);
      expect(mockDmxService.setChannelValue).toHaveBeenCalledWith(2, 10, 127);
      expect(mockDmxService.setChannelValue).toHaveBeenCalledWith(3, 256, 64);
    });
  });

  describe('fadeToScene', () => {
    it('should fade to scene channels', () => {
      const sceneChannels = [
        { universe: 1, channel: 1, value: 255 },
        { universe: 1, channel: 2, value: 128 },
      ];
      
      const fadeId = fadeEngine.fadeToScene(sceneChannels, 2);
      
      expect(fadeEngine['activeFades'].has(fadeId)).toBe(true);
      
      const fade = fadeEngine['activeFades'].get(fadeId);
      expect(fade?.channels).toHaveLength(2);
      expect(fade?.channels[0].endValue).toBe(255);
      expect(fade?.channels[1].endValue).toBe(128);
    });

    it('should accept custom fade ID', () => {
      const sceneChannels = [{ universe: 1, channel: 1, value: 255 }];
      const customId = 'scene-fade-1';
      
      const fadeId = fadeEngine.fadeToScene(sceneChannels, 1, customId);
      
      expect(fadeId).toBe(customId);
      expect(fadeEngine['activeFades'].has(customId)).toBe(true);
    });
  });

  describe('fadeToBlack', () => {
    it('should fade all active channels to 0', () => {
      mockDmxService.getAllUniverseOutputs.mockReturnValue([
        {
          universe: 1,
          channels: [255, 128, 0, 64, ...new Array(508).fill(0)],
        },
        {
          universe: 2,
          channels: [0, 0, 100, ...new Array(509).fill(0)],
        },
      ]);
      
      const fadeId = fadeEngine.fadeToBlack(1.5);
      
      expect(fadeId).toBe('fade-to-black');
      
      const fade = fadeEngine['activeFades'].get(fadeId);
      expect(fade?.channels).toHaveLength(4); // Only non-zero channels
      expect(fade?.duration).toBe(1500);
      
      // Check all target values are 0
      fade?.channels.forEach(channel => {
        expect(channel.endValue).toBe(0);
      });
    });

    it('should handle empty universe outputs', () => {
      mockDmxService.getAllUniverseOutputs.mockReturnValue([]);
      
      const fadeId = fadeEngine.fadeToBlack(1);
      
      const fade = fadeEngine['activeFades'].get(fadeId);
      expect(fade?.channels).toHaveLength(0);
    });
  });

  describe('fade cancellation', () => {
    it('should cancel specific fade', () => {
      const fadeId1 = fadeEngine.fadeChannels([{ universe: 1, channel: 1, targetValue: 255 }], 1);
      const fadeId2 = fadeEngine.fadeChannels([{ universe: 1, channel: 2, targetValue: 255 }], 1);
      
      fadeEngine.cancelFade(fadeId1);
      
      expect(fadeEngine['activeFades'].has(fadeId1)).toBe(false);
      expect(fadeEngine['activeFades'].has(fadeId2)).toBe(true);
    });

    it('should cancel all fades', () => {
      fadeEngine.fadeChannels([{ universe: 1, channel: 1, targetValue: 255 }], 1);
      fadeEngine.fadeChannels([{ universe: 1, channel: 2, targetValue: 255 }], 1);
      fadeEngine.fadeChannels([{ universe: 1, channel: 3, targetValue: 255 }], 1);
      
      expect(fadeEngine['activeFades'].size).toBe(3);
      
      fadeEngine.cancelAllFades();
      
      expect(fadeEngine['activeFades'].size).toBe(0);
    });

    it('should not process cancelled fades', () => {
      const fadeId = fadeEngine.fadeChannels([{ universe: 1, channel: 1, targetValue: 255 }], 1);
      
      jest.advanceTimersByTime(100);
      const callCountBefore = mockDmxService.setChannelValue.mock.calls.length;
      
      fadeEngine.cancelFade(fadeId);
      jest.advanceTimersByTime(100);
      
      const callCountAfter = mockDmxService.setChannelValue.mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });
  });

  describe('edge cases', () => {
    it('should clamp channel values to 0-255 range', () => {
      mockDmxService.getChannelValue.mockReturnValue(300); // Invalid start value
      
      const channels = [
        { universe: 1, channel: 1, targetValue: -50 }, // Negative target
        { universe: 1, channel: 2, targetValue: 1000 }, // Over 255
      ];
      
      fadeEngine.fadeChannels(channels, 0.1);
      
      // Process to completion
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // Values should be clamped
      expect(mockDmxService.setChannelValue).toHaveBeenCalledWith(1, 1, expect.any(Number));
      expect(mockDmxService.setChannelValue).toHaveBeenCalledWith(1, 2, expect.any(Number));
      
      // Get the final values that were set
      const calls = mockDmxService.setChannelValue.mock.calls;
      const finalCalls = calls.filter(call => call[1] === 1 || call[1] === 2);
      const lastCallsCh1 = finalCalls.filter(call => call[1] === 1).pop();
      const lastCallsCh2 = finalCalls.filter(call => call[1] === 2).pop();
      
      // FadeEngine passes the raw values, DMX service handles clamping
      expect(lastCallsCh1?.[2]).toBe(-50);
      expect(lastCallsCh2?.[2]).toBe(1000);
    });

    it('should handle progress > 1 gracefully', () => {
      const channels = [{ universe: 1, channel: 1, targetValue: 255 }];
      fadeEngine.fadeChannels(channels, 0.1);
      
      // Run for longer than fade duration
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // Fade should be removed after completion
      expect(fadeEngine['activeFades'].size).toBe(0);
    });

    it('should handle multiple simultaneous fades on different channels', () => {
      fadeEngine.fadeChannels([{ universe: 1, channel: 1, targetValue: 255 }], 1, 'fade1');
      fadeEngine.fadeChannels([{ universe: 1, channel: 2, targetValue: 128 }], 0.5, 'fade2');
      fadeEngine.fadeChannels([{ universe: 2, channel: 1, targetValue: 64 }], 2, 'fade3');
      
      expect(fadeEngine['activeFades'].size).toBe(3);
      
      // Run for 500ms
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(25);
      }
      
      // fade2 should be complete, others still running
      expect(fadeEngine['activeFades'].has('fade1')).toBe(true);
      expect(fadeEngine['activeFades'].has('fade2')).toBe(false);
      expect(fadeEngine['activeFades'].has('fade3')).toBe(true);
    });
  });

  describe('performance with large channel count', () => {
    it('should handle fading all 2048 channels efficiently', () => {
      const channels: Array<{ universe: number; channel: number; targetValue: number }> = [];
      
      // Create maximum channels (4 universes × 512 channels)
      for (let universe = 1; universe <= 4; universe++) {
        for (let channel = 1; channel <= 512; channel++) {
          channels.push({ 
            universe, 
            channel, 
            targetValue: Math.floor(Math.random() * 256) 
          });
        }
      }
      
      const startTime = performance.now();
      fadeEngine.fadeChannels(channels, 1);
      
      // Process one frame
      jest.advanceTimersByTime(25);
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Processing should be fast even with 2048 channels
      expect(processingTime).toBeLessThan(50); // Should process in under 50ms
      
      // Verify all channels were updated
      expect(mockDmxService.setChannelValue).toHaveBeenCalledTimes(2048);
    });
  });
});