import {
  parseChannelValues,
  serializeChannelValues,
  parseTags,
  serializeTags,
} from '../db-helpers';

describe('db-helpers', () => {
  describe('parseChannelValues', () => {
    it('should parse valid JSON string to number array', () => {
      expect(parseChannelValues('[255, 128, 64]')).toEqual([255, 128, 64]);
    });

    it('should return empty array for null', () => {
      expect(parseChannelValues(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(parseChannelValues(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseChannelValues('')).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(parseChannelValues('invalid json')).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse channel values:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should return empty array for non-array JSON', () => {
      expect(parseChannelValues('{"foo": "bar"}')).toEqual([]);
    });
  });

  describe('serializeChannelValues', () => {
    it('should serialize number array to JSON string', () => {
      expect(serializeChannelValues([255, 128, 64])).toBe('[255,128,64]');
    });

    it('should serialize empty array', () => {
      expect(serializeChannelValues([])).toBe('[]');
    });
  });

  describe('parseTags', () => {
    it('should parse valid JSON string to string array', () => {
      expect(parseTags('["wash", "color", "front"]')).toEqual(['wash', 'color', 'front']);
    });

    it('should return empty array for null', () => {
      expect(parseTags(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(parseTags(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseTags('')).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      expect(parseTags('invalid json')).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse tags:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should return empty array for non-array JSON', () => {
      expect(parseTags('{"foo": "bar"}')).toEqual([]);
    });
  });

  describe('serializeTags', () => {
    it('should serialize string array to JSON string', () => {
      expect(serializeTags(['wash', 'color', 'front'])).toBe('["wash","color","front"]');
    });

    it('should serialize empty array', () => {
      expect(serializeTags([])).toBe('[]');
    });
  });
});
