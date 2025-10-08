import { PrismaClient } from "@prisma/client";
import { PubSub } from "graphql-subscriptions";
import { dmxService } from "./dmx";

export interface PreviewSession {
  id: string;
  projectId: string;
  userId?: string;
  isActive: boolean;
  createdAt: Date;
  channelOverrides: Map<string, number>; // Key: "universe:channel", Value: 0-255
  timeout?: NodeJS.Timeout;
}

export class PreviewService {
  private sessions: Map<string, PreviewSession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(
    private prisma: PrismaClient,
    private pubsub: PubSub,
  ) {}

  async startPreviewSession(
    projectId: string,
    userId?: string,
  ): Promise<PreviewSession> {
    // Cancel any existing session for this project
    await this.cancelExistingProjectSessions(projectId);

    const sessionId = `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: PreviewSession = {
      id: sessionId,
      projectId,
      userId,
      isActive: true,
      createdAt: new Date(),
      channelOverrides: new Map(),
    };

    // Set auto-cleanup timeout
    session.timeout = setTimeout(() => {
      this.cancelPreviewSession(sessionId);
    }, this.SESSION_TIMEOUT);

    this.sessions.set(sessionId, session);

    // Notify subscribers
    await this.pubsub.publish("PREVIEW_SESSION_UPDATED", {
      previewSessionUpdated: {
        id: sessionId,
        projectId,
        isActive: true,
        createdAt: session.createdAt.toISOString(),
        dmxOutput: await this.getCurrentDMXOutput(sessionId),
      },
    });

    return session;
  }

  async updateChannelValue(
    sessionId: string,
    fixtureId: string,
    channelIndex: number,
    value: number,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    // Get fixture information to calculate universe and channel
    const fixture = await this.prisma.fixtureInstance.findUnique({
      where: { id: fixtureId },
      include: { definition: true },
    });

    if (!fixture) {
      return false;
    }

    const absoluteChannel = fixture.startChannel + channelIndex;
    const channelKey = `${fixture.universe}:${absoluteChannel}`;

    // Update the channel override
    session.channelOverrides.set(channelKey, Math.max(0, Math.min(255, value)));

    // Apply the preview overlay to DMX output
    await this.applyPreviewOverlay(session);

    // Notify subscribers of channel changes
    await this.pubsub.publish("DMX_OUTPUT_CHANGED", {
      dmxOutputChanged: {
        universe: fixture.universe,
        channels: await this.getUniverseChannels(fixture.universe, sessionId),
      },
    });

    // Update session timestamp
    session.createdAt = new Date();
    if (session.timeout) {
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => {
        this.cancelPreviewSession(sessionId);
      }, this.SESSION_TIMEOUT);
    }

    return true;
  }

  async commitPreviewSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    // The preview changes are already live in DMX output
    // For now, we just clean up the session
    // Future: Could save preview state as a new scene

    await this.cancelPreviewSession(sessionId);
    return true;
  }

  async initializeWithScene(
    sessionId: string,
    sceneId: string,
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    try {
      // Get scene data with all fixture values
      const scene = await this.prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          fixtureValues: {
            include: {
              fixture: true,
            },
          },
        },
      });

      if (!scene) {
        return false;
      }

      // Apply all fixture values from the scene to the preview session
      for (const fixtureValue of scene.fixtureValues) {
        // channelValues might be a string (from DB) or array (if middleware deserialized it)
        let channelValues: number[] = [];
        if (typeof fixtureValue.channelValues === 'string') {
          try {
            channelValues = JSON.parse(fixtureValue.channelValues);
          } catch {
            channelValues = [];
          }
        } else {
          channelValues = fixtureValue.channelValues as unknown as number[];
        }

        for (
          let channelIndex = 0;
          channelIndex < channelValues.length;
          channelIndex++
        ) {
          const value = channelValues[channelIndex];
          if (value !== null && value !== undefined) {
            // Calculate absolute DMX channel
            const absoluteChannel =
              fixtureValue.fixture.startChannel + channelIndex;
            const channelKey = `${fixtureValue.fixture.universe}:${absoluteChannel}`;

            // Update the channel override
            session.channelOverrides.set(
              channelKey,
              Math.max(0, Math.min(255, value)),
            );
          }
        }
      }

      // Apply all channel overrides to DMX output at once
      await this.applyPreviewOverlay(session);

      // Notify subscribers of the bulk update
      const universesUsed = new Set<number>();
      for (const channelKey of session.channelOverrides.keys()) {
        const [universe] = channelKey.split(":").map(Number);
        universesUsed.add(universe);
      }

      for (const universe of universesUsed) {
        await this.pubsub.publish("DMX_OUTPUT_CHANGED", {
          dmxOutputChanged: {
            universe,
            channels: await this.getUniverseChannels(universe, sessionId),
          },
        });
      }

      return true;
    } catch (error) {
      // TODO: Replace with proper logging
      // eslint-disable-next-line no-console
      console.error("Error initializing preview with scene:", error);
      return false;
    }
  }

  async cancelPreviewSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Clear timeout
    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    // Remove channel overrides from DMX output
    for (const [channelKey] of session.channelOverrides) {
      const [universe, channel] = channelKey.split(":").map(Number);
      dmxService.clearChannelOverride(universe, channel);
    }

    // Mark session as inactive
    session.isActive = false;
    this.sessions.delete(sessionId);

    // Notify subscribers
    await this.pubsub.publish("PREVIEW_SESSION_UPDATED", {
      previewSessionUpdated: {
        id: sessionId,
        projectId: session.projectId,
        isActive: false,
        createdAt: session.createdAt.toISOString(),
        dmxOutput: [],
      },
    });

    return true;
  }

  async getPreviewSession(sessionId: string): Promise<PreviewSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  private async cancelExistingProjectSessions(
    projectId: string,
  ): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.projectId === projectId && session.isActive) {
        await this.cancelPreviewSession(sessionId);
      }
    }
  }

  private async applyPreviewOverlay(session: PreviewSession): Promise<void> {
    for (const [channelKey, value] of session.channelOverrides) {
      const [universe, channel] = channelKey.split(":").map(Number);
      dmxService.setChannelOverride(universe, channel, value);
    }
  }

  private async getCurrentDMXOutput(
    sessionId: string,
  ): Promise<Array<{ universe: number; channels: number[] }>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const universesUsed = new Set<number>();
    for (const channelKey of session.channelOverrides.keys()) {
      const [universe] = channelKey.split(":").map(Number);
      universesUsed.add(universe);
    }

    const output = [];
    for (const universe of universesUsed) {
      output.push({
        universe,
        channels: await this.getUniverseChannels(universe, sessionId),
      });
    }

    return output;
  }

  private async getUniverseChannels(
    universe: number,
    sessionId?: string,
  ): Promise<number[]> {
    const channels = new Array(512).fill(0);

    // Get current DMX state
    const currentChannels = dmxService.getUniverseChannels(universe);
    if (currentChannels) {
      channels.splice(0, currentChannels.length, ...currentChannels);
    }

    // Apply preview overrides if session provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        for (const [channelKey, value] of session.channelOverrides) {
          const [channelUniverse, channel] = channelKey.split(":").map(Number);
          if (channelUniverse === universe && channel >= 1 && channel <= 512) {
            channels[channel - 1] = value;
          }
        }
      }
    }

    return channels;
  }
}

// Export singleton instance
let previewServiceInstance: PreviewService | null = null;

export function getPreviewService(): PreviewService {
  if (!previewServiceInstance) {
    // Dynamic imports to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PubSub } = require("graphql-subscriptions");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");

    previewServiceInstance = new PreviewService(
      new PrismaClient(),
      new PubSub(),
    );
  }
  return previewServiceInstance;
}

// Export singleton instance for backwards compatibility
export const previewService = getPreviewService();
