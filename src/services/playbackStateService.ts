import { PubSub } from "graphql-subscriptions";
import { PrismaClient } from "@prisma/client";
import { prisma, pubsub } from "../context";
import { dmxService } from "./dmx";
import { fadeEngine, EasingType } from "./fadeEngine";
import { logger } from "../utils/logger";

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

  /**
   * Execute a cue's DMX output without managing playback state.
   * This is called by both the playCue resolver and handleFollowTime.
   */
  async executeCueDmx(
    cue: {
      id: string;
      fadeInTime: number;
      easingType?: string | null;
      scene: {
        id: string;
        fixtureValues: Array<{
          channelValues: number[] | string;
          fixture: {
            universe: number;
            startChannel: number;
          };
        }>;
      };
    },
    fadeInTime?: number,
  ): Promise<void> {
    // Use provided fadeInTime or default to cue's fadeInTime
    const actualFadeTime =
      fadeInTime !== undefined ? fadeInTime : cue.fadeInTime;

    // Build array of all channel values for the scene
    const sceneChannels: Array<{
      universe: number;
      channel: number;
      value: number;
    }> = [];

    for (const fixtureValue of cue.scene.fixtureValues) {
      const fixture = fixtureValue.fixture;

      // channelValues might be a string (from DB) or array (if middleware deserialized it)
      let channelValues: number[] = [];
      if (typeof fixtureValue.channelValues === 'string') {
        try {
          channelValues = JSON.parse(fixtureValue.channelValues);
        } catch (error) {
          logger.warn('Failed to parse channelValues as JSON', {
            fixtureUniverse: fixture.universe,
            fixtureStartChannel: fixture.startChannel,
            error,
          });
          channelValues = [];
        }
      } else {
        channelValues = fixtureValue.channelValues as number[];
      }

      // Iterate through channelValues array by index
      for (
        let channelIndex = 0;
        channelIndex < channelValues.length;
        channelIndex++
      ) {
        const value = channelValues[channelIndex];
        const dmxChannel = fixture.startChannel + channelIndex;

        sceneChannels.push({
          universe: fixture.universe,
          channel: dmxChannel,
          value: value,
        });
      }
    }

    // Use fade engine to transition to the scene with the cue's easing type
    fadeEngine.fadeToScene(
      sceneChannels,
      actualFadeTime,
      `cue-${cue.id}`,
      cue.easingType as EasingType | undefined,
    );

    // Track the currently active scene (from the cue)
    dmxService.setActiveScene(cue.scene.id);
  }

  // Handle automatic follow to next cue
  private async handleFollowTime(
    cueListId: string,
    currentCueIndex: number,
  ): Promise<void> {
    try {
      // First, get just the cue list with basic cue info (no scene data) to determine next cue
      const cueList = await this.prisma.cueList.findUnique({
        where: { id: cueListId },
        include: {
          cues: {
            select: {
              id: true,
              cueNumber: true,
            },
            orderBy: { cueNumber: "asc" },
          },
        },
      });

      if (!cueList) {
        // Cue list not found, mark as stopped
        const state = this.states.get(cueListId);
        if (state) {
          state.isPlaying = false;
          state.lastUpdated = new Date();
          this.emitUpdate(cueListId);
        }
        return;
      }

      // Determine next cue index
      let nextCueIndex = currentCueIndex + 1;

      // If we've reached the end of the cue list
      if (nextCueIndex >= cueList.cues.length) {
        // Check if loop is enabled
        if (cueList.loop && cueList.cues.length > 0) {
          // Loop back to the first cue
          nextCueIndex = 0;
        } else {
          // No loop, mark as stopped
          const state = this.states.get(cueListId);
          if (state) {
            state.isPlaying = false;
            state.lastUpdated = new Date();
            this.emitUpdate(cueListId);
          }
          return;
        }
      }

      // Now fetch only the next cue with full scene data
      const nextCue = await this.prisma.cue.findUnique({
        where: { id: cueList.cues[nextCueIndex].id },
        include: {
          scene: {
            include: {
              fixtureValues: {
                include: {
                  fixture: true,
                },
              },
            },
          },
        },
      });

      if (!nextCue) {
        throw new Error(
          `Next cue not found in cue list '${cueListId}' at index ${nextCueIndex} (cueId: ${cueList.cues[nextCueIndex]?.id}). Total cues: ${cueList.cues.length}`,
        );
      }

      // Execute the cue's DMX output
      await this.executeCueDmx(nextCue);

      // Update playback state for the new cue
      await this.startCue(cueListId, nextCueIndex, nextCue);
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
