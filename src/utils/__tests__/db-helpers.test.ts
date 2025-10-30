import {
  parseChannelValues,
  serializeChannelValues,
  parseTags,
  serializeTags,
} from '../db-helpers';

describe('db-helpers', () => {
  describe('parseChannelValues', () => {
    it('should parse valid JSON array', () => {
      const result = parseChannelValues('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array for null', () => {
      const result = parseChannelValues(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      const result = parseChannelValues(undefined);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = parseChannelValues('not valid json');
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse channel values:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should return empty array for non-array JSON', () => {
      const result = parseChannelValues('{"key": "value"}');
      expect(result).toEqual([]);
    });
  });

  describe('serializeChannelValues', () => {
    it('should serialize array to JSON string', () => {
      const result = serializeChannelValues([1, 2, 3]);
      expect(result).toBe('[1,2,3]');
    });

    it('should serialize empty array', () => {
      const result = serializeChannelValues([]);
      expect(result).toBe('[]');
    });
  });

  describe('parseTags', () => {
    it('should parse valid JSON array', () => {
      const result = parseTags('["tag1", "tag2"]');
      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('should return empty array for null', () => {
      const result = parseTags(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      const result = parseTags(undefined);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = parseTags('not valid json');
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse tags:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should return empty array for non-array JSON', () => {
      const result = parseTags('{"key": "value"}');
      expect(result).toEqual([]);
    });
  });

  describe('serializeTags', () => {
    it('should serialize array to JSON string', () => {
      const result = serializeTags(['tag1', 'tag2']);
      expect(result).toBe('["tag1","tag2"]');
    });

    it('should serialize empty array', () => {
      const result = serializeTags([]);
      expect(result).toBe('[]');
    });
  });
});
