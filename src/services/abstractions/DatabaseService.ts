import { PrismaClient, FixtureType, ChannelType } from "@prisma/client";

export interface ChannelDefinition {
  name: string;
  type: ChannelType;
  offset: number;
  minValue: number;
  maxValue: number;
  defaultValue: number;
}

export interface ModeChannelDefinition {
  offset: number;
  channelName: string;  // Will be used to find the channel after creation
}

export interface ModeDefinition {
  name: string;
  shortName?: string | null;
  channelCount: number;
  channels: ModeChannelDefinition[];
}

export interface FixtureDefinition {
  manufacturer: string;
  model: string;
  type: FixtureType;
  isBuiltIn: boolean;
  channels: {
    create: ChannelDefinition[];
  };
  modes?: ModeDefinition[];
}

export interface IDatabaseService {
  getFixtureCount(): Promise<number>;
  createFixtures(fixtures: FixtureDefinition[]): Promise<{ count: number }>;
}

export class DatabaseService implements IDatabaseService {
  constructor(private prisma: PrismaClient) {}

  async getFixtureCount(): Promise<number> {
    return this.prisma.fixtureDefinition.count();
  }

  async createFixtures(fixtures: FixtureDefinition[]): Promise<{ count: number }> {
    // createMany doesn't support nested creates, so we use individual creates in a transaction
    // Increase timeout for large fixture imports (default is 5s, we use 60s)
    const results = await this.prisma.$transaction(async (tx) => {
      const createdFixtures = [];

      for (const fixture of fixtures) {
        // Create the fixture with channels
        const createdFixture = await tx.fixtureDefinition.create({
          data: {
            manufacturer: fixture.manufacturer,
            model: fixture.model,
            type: fixture.type,
            isBuiltIn: fixture.isBuiltIn,
            channels: fixture.channels
          },
          include: {
            channels: true
          }
        });

        // Create modes if provided
        if (fixture.modes && fixture.modes.length > 0) {
          for (const mode of fixture.modes) {
            await tx.fixtureMode.create({
              data: {
                name: mode.name,
                shortName: mode.shortName,
                channelCount: mode.channelCount,
                definitionId: createdFixture.id,
                modeChannels: {
                  create: mode.channels.map(mc => {
                    const channel = createdFixture.channels.find(c => c.name === mc.channelName);
                    if (!channel) {
                      throw new Error(`Channel ${mc.channelName} not found for mode ${mode.name}`);
                    }
                    return {
                      offset: mc.offset,
                      channelId: channel.id
                    };
                  })
                }
              }
            });
          }
        }

        createdFixtures.push(createdFixture);
      }

      return createdFixtures;
    }, {
      maxWait: 10000, // Wait up to 10s to start transaction
      timeout: 60000,  // Allow transaction to run for up to 60s
    });

    return { count: results.length };
  }
}