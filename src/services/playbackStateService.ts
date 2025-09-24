import { PubSub } from "graphql-subscriptions";
import { PrismaClient } from "@prisma/client";
import { prisma, pubsub } from "../context";

export interface PlaybackState {
  cueListId: string;
  currentCueIndex: number | null;
  isPlaying: boolean;
  currentCue?: CueForPlayback;
  fadeProgress: number;
  startTime?: Date;
  lastUpdated: Date;
}

interface CueForPlayback {
  id: string;
  name: string;
  cueNumber: number;
  fadeInTime: number;
  fadeOutTime: number;
  followTime?: number | null;
}

export interface CueListPlaybackStatus {
  cueListId: string;
  currentCueIndex: number | null;
  isPlaying: boolean;
  currentCue?: CueForPlayback;
  fadeProgress: number;
  lastUpdated: string;
}

class PlaybackStateService {
  private states = new Map<string, PlaybackState>();
  private fadeProgressIntervals = new Map<string, NodeJS.Timeout>();
  private followTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaClient,
    private pubsub: PubSub,
  ) {}

  // Get current playback state for a cue list
  getPlaybackState(cueListId: string): PlaybackState | null {
    return this.states.get(cueListId) || null;
  }

  // Start playing a cue
  async startCue(
    cueListId: string,
    cueIndex: number,
    cue: CueForPlayback,
  ): Promise<void> {
    // Clear any existing state for this cue list
    this.stopCueList(cueListId);

    const state: PlaybackState = {
      cueListId,
      currentCueIndex: cueIndex,
      isPlaying: true,
      currentCue: {
        id: cue.id,
        name: cue.name,
        cueNumber: cue.cueNumber,
        fadeInTime: cue.fadeInTime,
        fadeOutTime: cue.fadeOutTime,
        followTime: cue.followTime,
      },
      fadeProgress: 0,
      startTime: new Date(),
      lastUpdated: new Date(),
    };

    this.states.set(cueListId, state);

    // Start fade progress tracking
    this.startFadeProgress(cueListId, cue.fadeInTime);

    // Emit subscription update
    this.emitUpdate(cueListId);

    // Schedule follow time if applicable
    if (cue.followTime && cue.followTime > 0) {
      const totalWaitTime = (cue.fadeInTime + cue.followTime) * 1000;

      const followTimeout = setTimeout(async () => {
        await this.handleFollowTime(cueListId, cueIndex);
      }, totalWaitTime);

      this.followTimeouts.set(cueListId, followTimeout);
    } else {
      // Mark as not playing after fade completes
      setTimeout(() => {
        const currentState = this.states.get(cueListId);
        if (currentState && currentState.currentCueIndex === cueIndex) {
          currentState.isPlaying = false;
          currentState.lastUpdated = new Date();
          this.emitUpdate(cueListId);
        }
      }, cue.fadeInTime * 1000);
    }
  }

  // Handle automatic follow to next cue
  private async handleFollowTime(
    cueListId: string,
    currentCueIndex: number,
  ): Promise<void> {
    try {
      // Get the cue list and find the next cue
      const cueList = await this.prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList || currentCueIndex + 1 >= cueList.cues.length) {
        // No next cue, mark as stopped
        const state = this.states.get(cueListId);
        if (state) {
          state.isPlaying = false;
          state.lastUpdated = new Date();
          this.emitUpdate(cueListId);
        }
        return;
      }

      const nextCue = cueList.cues[currentCueIndex + 1];
      await this.startCue(cueListId, currentCueIndex + 1, nextCue);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error handling follow time:", error);
      this.stopCueList(cueListId);
    }
  }

  // Stop playback for a cue list
  stopCueList(cueListId: string): void {
    // Clear intervals and timeouts
    const fadeInterval = this.fadeProgressIntervals.get(cueListId);
    if (fadeInterval) {
      clearInterval(fadeInterval);
      this.fadeProgressIntervals.delete(cueListId);
    }

    const followTimeout = this.followTimeouts.get(cueListId);
    if (followTimeout) {
      clearTimeout(followTimeout);
      this.followTimeouts.delete(cueListId);
    }

    // Update state
    const state = this.states.get(cueListId);
    if (state) {
      state.isPlaying = false;
      state.fadeProgress = 0;
      state.lastUpdated = new Date();
      this.emitUpdate(cueListId);
    }
  }

  // Stop all cue lists (for fadeToBlack scenarios)
  stopAllCueLists(): void {
    // Get all active cue list IDs
    const cueListIds = Array.from(this.states.keys());

    // Stop each cue list individually to ensure proper cleanup and notifications
    for (const cueListId of cueListIds) {
      this.stopCueList(cueListId);
    }
  }

  // Jump to a specific cue
  async jumpToCue(cueListId: string, cueIndex: number): Promise<void> {
    try {
      const cueList = await this.prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList || cueIndex >= cueList.cues.length || cueIndex < 0) {
        throw new Error("Invalid cue index");
      }

      const cue = cueList.cues[cueIndex];
      await this.startCue(cueListId, cueIndex, cue);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error jumping to cue:", error);
      throw error;
    }
  }

  // Start tracking fade progress
  private startFadeProgress(cueListId: string, fadeTime: number): void {
    const state = this.states.get(cueListId);
    if (!state) {
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const currentState = this.states.get(cueListId);
      if (!currentState) {
        clearInterval(interval);
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / (fadeTime * 1000)) * 100, 100);

      currentState.fadeProgress = progress;
      currentState.lastUpdated = new Date();

      // Emit update periodically during fade
      this.emitUpdate(cueListId);

      if (progress >= 100) {
        clearInterval(interval);
        this.fadeProgressIntervals.delete(cueListId);
      }
    }, 100); // Update every 100ms

    this.fadeProgressIntervals.set(cueListId, interval);
  }

  // Emit subscription update
  private emitUpdate(cueListId: string): void {
    const state = this.states.get(cueListId);
    if (!state) {
      return;
    }

    const status: CueListPlaybackStatus = {
      cueListId: state.cueListId,
      currentCueIndex: state.currentCueIndex,
      isPlaying: state.isPlaying,
      currentCue: state.currentCue,
      fadeProgress: state.fadeProgress,
      lastUpdated: state.lastUpdated.toISOString(),
    };

    // Publish to the generic channel that the subscription is listening to
    // The subscription resolver will filter by cueListId
    this.pubsub.publish("CUE_LIST_PLAYBACK_UPDATED", {
      cueListPlaybackUpdated: status,
    });
  }

  // Get formatted status for GraphQL response
  getFormattedStatus(cueListId: string): CueListPlaybackStatus | null {
    const state = this.states.get(cueListId);
    if (!state) {
      return {
        cueListId,
        currentCueIndex: null,
        isPlaying: false,
        currentCue: undefined,
        fadeProgress: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      cueListId: state.cueListId,
      currentCueIndex: state.currentCueIndex,
      isPlaying: state.isPlaying,
      currentCue: state.currentCue,
      fadeProgress: state.fadeProgress,
      lastUpdated: state.lastUpdated.toISOString(),
    };
  }

  // Cleanup method
  cleanup(): void {
    // Clear all intervals and timeouts
    for (const interval of this.fadeProgressIntervals.values()) {
      clearInterval(interval);
    }
    for (const timeout of this.followTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.fadeProgressIntervals.clear();
    this.followTimeouts.clear();
    this.states.clear();
  }
}

// Singleton instance
let playbackStateServiceInstance: PlaybackStateService | null = null;

export function getPlaybackStateService(): PlaybackStateService {
  if (!playbackStateServiceInstance) {
    // Use shared singleton instances from context
    playbackStateServiceInstance = new PlaybackStateService(prisma, pubsub);
  }
  return playbackStateServiceInstance;
}

export function setPlaybackStateService(service: PlaybackStateService): void {
  playbackStateServiceInstance = service;
}
