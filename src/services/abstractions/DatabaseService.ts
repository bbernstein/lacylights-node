import { PrismaClient, FixtureType, ChannelType } from "@prisma/client";

export interface ChannelDefinition {
  name: string;
  type: ChannelType;
  offset: number;
  minValue: number;
  maxValue: number;
  defaultValue: number;
}

export interface FixtureDefinition {
  manufacturer: string;
  model: string;
  type: FixtureType;
  isBuiltIn: boolean;
  channels: {
    create: ChannelDefinition[];
  };
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
    const results = await this.prisma.$transaction(
      fixtures.map(fixture =>
        this.prisma.fixtureDefinition.create({
          data: fixture
        })
      )
    );
    return { count: results.length };
  }
}