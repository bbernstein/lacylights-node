/**
 * Database Helper Functions
 * Utilities for handling SQLite-specific data transformations
 */

/**
 * Parse channel values from database string to number array
 */
export function parseChannelValues(channelValues: string | null | undefined): number[] {
  if (!channelValues) {
    return [];
  }
  try {
    const parsed = JSON.parse(channelValues);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse channel values:', error);
    return [];
  }
}

/**
 * Serialize channel values from number array to database string
 */
export function serializeChannelValues(channelValues: number[]): string {
  return JSON.stringify(channelValues);
}

/**
 * Parse tags from database string to string array
 */
export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) {
    return [];
  }
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse tags:', error);
    return [];
  }
}

/**
 * Serialize tags from string array to database string
 */
export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}
