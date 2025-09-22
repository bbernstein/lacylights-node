import type { PrismaClient, Cue, Scene } from '@prisma/client';
import type { PubSub } from 'graphql-subscriptions';
import { getSharedPrisma, getSharedPubSub } from '../context';
import { logger } from '../utils/logger';

type CueWithScene = Cue & { scene: Scene };

export interface CueListPlaybackStatus {
  cueListId: string;
  isPlaying: boolean;
  currentCue: CueWithScene | null;
  nextCue: CueWithScene | null;
  previousCue: CueWithScene | null;
  fadeProgress: number;
  lastUpdated: string;
}

class PlaybackService {
  private prisma: PrismaClient;
  private pubsub: PubSub;

  // In-memory cache to avoid repeated DB calls
  private playbackStates: Map<string, CueListPlaybackStatus> = new Map();
  private cueListCache: Map<string, CueWithScene[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Throttling for subscription events
  private lastEmissionTime: Map<string, number> = new Map();
  private readonly EMISSION_THROTTLE = 100; // Minimum 100ms between emissions

  constructor() {
    this.prisma = getSharedPrisma();
    this.pubsub = getSharedPubSub();
  }

  /**
   * Get cached cues for a cue list, with automatic cache invalidation
   */
  private async getCachedCueList(cueListId: string): Promise<CueWithScene[]> {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(cueListId);

    // Check if cache is valid
    if (expiry && now < expiry && this.cueListCache.has(cueListId)) {
      return this.cueListCache.get(cueListId)!;
    }

    // Cache miss or expired - fetch from database
    logger.debug('Fetching cue list from database', { cueListId });

    const cueList = await this.prisma.cueList.findUnique({
      where: { id: cueListId },
      include: {
        cues: {
          include: {
            scene: true,
          },
          orderBy: {
            cueNumber: 'asc',
          },
        },
      },
    });

    if (!cueList) {
      throw new Error(`Cue list with ID ${cueListId} not found`);
    }

    // Update cache
    this.cueListCache.set(cueListId, cueList.cues);
    this.cacheExpiry.set(cueListId, now + this.CACHE_TTL);

    return cueList.cues;
  }

  /**
   * Get current playback status for a cue list
   */
  async getPlaybackStatus(cueListId: string): Promise<CueListPlaybackStatus> {
    // Input validation
    if (!cueListId || typeof cueListId !== 'string') {
      throw new Error('Invalid cueListId: must be a non-empty string');
    }

    // Check if we have cached state
    const cachedState = this.playbackStates.get(cueListId);
    if (cachedState) {
      return cachedState;
    }

    // Initialize state for new cue list
    const cues = await this.getCachedCueList(cueListId);

    const initialState: CueListPlaybackStatus = {
      cueListId,
      isPlaying: false,
      currentCue: null,
      nextCue: cues.length > 0 ? cues[0] : null,
      previousCue: null,
      fadeProgress: 0,
      lastUpdated: new Date().toISOString(),
    };

    this.playbackStates.set(cueListId, initialState);
    return initialState;
  }

  /**
   * Update playback status and emit subscription event (throttled)
   */
  async updatePlaybackStatus(
    cueListId: string,
    updates: Partial<Omit<CueListPlaybackStatus, 'cueListId' | 'lastUpdated'>>
  ): Promise<void> {
    const currentState = await this.getPlaybackStatus(cueListId);

    const newState: CueListPlaybackStatus = {
      ...currentState,
      ...updates,
      cueListId, // Ensure cueListId is not overridden
      lastUpdated: new Date().toISOString(),
    };

    this.playbackStates.set(cueListId, newState);

    // Throttle subscription emissions to avoid flooding
    const now = Date.now();
    const lastEmission = this.lastEmissionTime.get(cueListId) || 0;

    if (now - lastEmission >= this.EMISSION_THROTTLE) {
      this.lastEmissionTime.set(cueListId, now);

      // Emit subscription event
      this.pubsub.publish('CUE_LIST_PLAYBACK_UPDATED', {
        cueListPlaybackUpdated: newState,
      });

      logger.debug('Published cue list playback update', {
        cueListId,
        isPlaying: newState.isPlaying,
        fadeProgress: newState.fadeProgress
      });
    }
  }

  /**
   * Start playing a cue list
   */
  async startPlayback(cueListId: string): Promise<void> {
    const cues = await this.getCachedCueList(cueListId);
    if (cues.length === 0) {
      throw new Error('Cannot start playback: cue list is empty');
    }

    await this.updatePlaybackStatus(cueListId, {
      isPlaying: true,
      currentCue: cues[0],
      nextCue: cues.length > 1 ? cues[1] : null,
      previousCue: null,
      fadeProgress: 0,
    });
  }

  /**
   * Stop playing a cue list
   */
  async stopPlayback(cueListId: string): Promise<void> {
    await this.updatePlaybackStatus(cueListId, {
      isPlaying: false,
      fadeProgress: 0,
    });
  }

  /**
   * Jump to a specific cue by index
   */
  async jumpToCue(cueListId: string, cueIndex: number): Promise<void> {
    const cues = await this.getCachedCueList(cueListId);

    if (cueIndex < 0 || cueIndex >= cues.length) {
      throw new Error(`Invalid cue index: ${cueIndex}. Cue list has ${cues.length} cues.`);
    }

    const currentCue = cues[cueIndex];
    const nextCue = cueIndex + 1 < cues.length ? cues[cueIndex + 1] : null;
    const previousCue = cueIndex > 0 ? cues[cueIndex - 1] : null;

    await this.updatePlaybackStatus(cueListId, {
      currentCue,
      nextCue,
      previousCue,
      fadeProgress: 0,
    });
  }

  /**
   * Update fade progress for current cue
   */
  async updateFadeProgress(cueListId: string, progress: number): Promise<void> {
    // Clamp progress between 0 and 1
    const clampedProgress = Math.max(0, Math.min(1, progress));

    await this.updatePlaybackStatus(cueListId, {
      fadeProgress: clampedProgress,
    });
  }

  /**
   * Invalidate cache for a specific cue list (call when cues are modified)
   */
  invalidateCache(cueListId: string): void {
    this.cueListCache.delete(cueListId);
    this.cacheExpiry.delete(cueListId);
    logger.debug('Invalidated cache for cue list', { cueListId });
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.playbackStates.clear();
    this.cueListCache.clear();
    this.cacheExpiry.clear();
    this.lastEmissionTime.clear();
  }
}

// Export singleton instance
export const playbackService = new PlaybackService();