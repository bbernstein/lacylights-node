import { DMXService } from '../index';

describe('DMXService', () => {
  let dmxService: DMXService;

  beforeEach(async () => {
    // Create a new instance for each test
    dmxService = new DMXService();
    
    // Set test environment variables
    process.env.DMX_UNIVERSE_COUNT = '2';
    process.env.DMX_REFRESH_RATE = '44';
    
    await dmxService.initialize();
  });

  afterEach(() => {
    if (dmxService) {
      dmxService.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with correct number of universes', async () => {
      const universe1Output = dmxService.getUniverseOutput(1);
      const universe2Output = dmxService.getUniverseOutput(2);
      const universe3Output = dmxService.getUniverseOutput(3);

      expect(universe1Output).toHaveLength(512);
      expect(universe2Output).toHaveLength(512);
      expect(universe3Output).toHaveLength(0); // Should not exist
    });

    it('should initialize all channels to 0', async () => {
      const universe1Output = dmxService.getUniverseOutput(1);
      
      expect(universe1Output.every(value => value === 0)).toBe(true);
    });
  });

  describe('setChannelValue', () => {
    it('should set channel value correctly', () => {
      dmxService.setChannelValue(1, 1, 255);
      const output = dmxService.getUniverseOutput(1);
      
      expect(output[0]).toBe(255);
    });

    it('should clamp values to valid DMX range', () => {
      dmxService.setChannelValue(1, 1, 300); // Above max
      dmxService.setChannelValue(1, 2, -50); // Below min
      
      const output = dmxService.getUniverseOutput(1);
      
      expect(output[0]).toBe(255); // Clamped to max
      expect(output[1]).toBe(0);   // Clamped to min
    });

    it('should ignore invalid channel numbers', () => {
      dmxService.setChannelValue(1, 0, 100);   // Channel 0 (invalid)
      dmxService.setChannelValue(1, 513, 100); // Channel 513 (invalid)
      
      const output = dmxService.getUniverseOutput(1);
      
      expect(output.every(value => value === 0)).toBe(true);
    });

    it('should ignore invalid universe numbers', () => {
      dmxService.setChannelValue(99, 1, 100); // Universe doesn't exist
      
      // Should not throw an error
      expect(() => dmxService.setChannelValue(99, 1, 100)).not.toThrow();
    });
  });

  describe('getUniverseOutput', () => {
    it('should return copy of universe data', () => {
      dmxService.setChannelValue(1, 1, 100);
      
      const output1 = dmxService.getUniverseOutput(1);
      const output2 = dmxService.getUniverseOutput(1);
      
      // Should be equal but not the same reference
      expect(output1).toEqual(output2);
      expect(output1).not.toBe(output2);
    });

    it('should return empty array for non-existent universe', () => {
      const output = dmxService.getUniverseOutput(99);
      
      expect(output).toEqual([]);
    });
  });

  describe('getAllUniverseOutputs', () => {
    it('should return all universe outputs', () => {
      dmxService.setChannelValue(1, 1, 100);
      dmxService.setChannelValue(2, 5, 200);
      
      const allOutputs = dmxService.getAllUniverseOutputs();
      
      expect(allOutputs).toHaveLength(2);
      expect(allOutputs[0].universe).toBe(1);
      expect(allOutputs[0].channels[0]).toBe(100);
      expect(allOutputs[1].universe).toBe(2);
      expect(allOutputs[1].channels[4]).toBe(200);
    });

    it('should return copies of universe data', () => {
      const allOutputs1 = dmxService.getAllUniverseOutputs();
      const allOutputs2 = dmxService.getAllUniverseOutputs();
      
      expect(allOutputs1).toEqual(allOutputs2);
      expect(allOutputs1[0].channels).not.toBe(allOutputs2[0].channels);
    });
  });

  describe('stop', () => {
    it('should clear all channel values', () => {
      dmxService.setChannelValue(1, 1, 255);
      dmxService.setChannelValue(1, 2, 128);
      dmxService.setChannelValue(2, 1, 64);
      
      dmxService.stop();
      
      const universe1 = dmxService.getUniverseOutput(1);
      const universe2 = dmxService.getUniverseOutput(2);
      
      expect(universe1.every(value => value === 0)).toBe(true);
      expect(universe2.every(value => value === 0)).toBe(true);
    });
  });

  describe('multiple channel operations', () => {
    it('should handle multiple channel changes correctly', () => {
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
});