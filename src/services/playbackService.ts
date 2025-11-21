import { PrismaClient, Cue, Scene } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { logger } from "../utils/logger";

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

  constructor(prisma: PrismaClient, pubsub: PubSub) {
    this.prisma = prisma;
    this.pubsub = pubsub;
  }

  /**
   * Validate cueListId input
   */
  private validateCueListId(cueListId: string): void {
    if (!cueListId || typeof cueListId !== "string") {
      throw new Error("Invalid cueListId: must be a non-empty string");
    }
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
    logger.debug("Fetching cue list from database", { cueListId });

    const cueList = await this.prisma.cueList.findUnique({
      where: { id: cueListId },
      include: {
        cues: {
          include: {
            scene: true,
          },
          orderBy: {
            cueNumber: "asc",
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
    this.validateCueListId(cueListId);

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
    updates: Partial<Omit<CueListPlaybackStatus, "cueListId" | "lastUpdated">>,
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
      this.pubsub.publish("CUE_LIST_PLAYBACK_UPDATED", {
        cueListPlaybackUpdated: newState,
      });

      logger.debug("Published cue list playback update", {
        cueListId,
        isPlaying: newState.isPlaying,
        fadeProgress: newState.fadeProgress,
      });
    }
  }

  /**
   * Start playing a cue list
   */
  async startPlayback(cueListId: string): Promise<void> {
    this.validateCueListId(cueListId);
    const cues = await this.getCachedCueList(cueListId);
    if (cues.length === 0) {
      throw new Error("Cannot start playback: cue list is empty");
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
    this.validateCueListId(cueListId);
    await this.updatePlaybackStatus(cueListId, {
      isPlaying: false,
      fadeProgress: 0,
    });
  }

  /**
   * Jump to a specific cue by index
   */
  async jumpToCue(cueListId: string, cueIndex: number): Promise<void> {
    this.validateCueListId(cueListId);
    const cues = await this.getCachedCueList(cueListId);

    if (cueIndex < 0 || cueIndex >= cues.length) {
      throw new Error(
        `Invalid cue index: ${cueIndex}. Cue list has ${cues.length} cues.`,
      );
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
    logger.debug("Invalidated cache for cue list", { cueListId });
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
let playbackServiceInstance: PlaybackService | null = null;

export function getPlaybackService(
  prisma?: PrismaClient,
  pubsub?: PubSub,
): PlaybackService {
  if (!playbackServiceInstance) {
    // Use provided instances or get shared instances from context
    // Lazy import to avoid circular dependency
    let sharedPrisma: PrismaClient | undefined = prisma;
    let sharedPubSub: PubSub | undefined = pubsub;

    if (!prisma || !pubsub) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const context = require("../context");
        if (!sharedPrisma) {
          sharedPrisma = context.getSharedPrisma();
        }
        if (!sharedPubSub) {
          sharedPubSub = context.getSharedPubSub();
        }
      } catch {
        // Fallback for test environments or when context is not available
        if (!sharedPrisma) {
          sharedPrisma = new PrismaClient();
        }
        if (!sharedPubSub) {
          sharedPubSub = new PubSub();
        }
      }
    }

    if (!sharedPrisma || !sharedPubSub) {
      throw new Error("Failed to initialize PlaybackService: PrismaClient or PubSub is undefined.");
    }

    playbackServiceInstance = new PlaybackService(sharedPrisma, sharedPubSub);
  }
  return playbackServiceInstance;
}

// Function to reset the singleton (useful for testing)
export function resetPlaybackService(): void {
  playbackServiceInstance = null;
}

// Export singleton instance for backwards compatibility
export const playbackService = getPlaybackService();
