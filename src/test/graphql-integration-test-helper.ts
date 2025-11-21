import { ApolloServer, BaseContext } from '@apollo/server';
import { PrismaClient } from '@prisma/client';
import { PubSub } from 'graphql-subscriptions';
import { typeDefs } from '../graphql/schema';
import { resolvers } from '../graphql/resolvers';
import { Context } from '../context';
import { dmxService } from '../services/dmx';
import { TestDataFactory } from './test-data-factory';
import { GraphQLFormattedError } from 'graphql';

/**
 * Test-specific GraphQL server with utilities for executing queries and mutations
 */
export class GraphQLTestServer {
  public server: ApolloServer<BaseContext>;
  public prisma: PrismaClient;
  public pubsub: PubSub;
  public dataFactory: TestDataFactory;

  constructor(prisma: PrismaClient, pubsub: PubSub) {
    this.prisma = prisma;
    this.pubsub = pubsub;
    this.dataFactory = new TestDataFactory(prisma);

    this.server = new ApolloServer<BaseContext>({
      typeDefs,
      resolvers,
    });
  }

  /**
   * Create test context for GraphQL operations
   */
  createContext(): Context {
    return {
      prisma: this.prisma,
      pubsub: this.pubsub,
    };
  }

  /**
   * Execute a GraphQL query
   */
  async executeQuery<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data: TData; errors?: ReadonlyArray<GraphQLFormattedError> }> {
    const response = await this.server.executeOperation(
      {
        query,
        variables,
      },
      {
        contextValue: this.createContext() as BaseContext,
      }
    );

    if (response.body.kind === 'single') {
      return {
        data: response.body.singleResult.data as TData,
        errors: response.body.singleResult.errors,
      };
    }

    throw new Error('Unexpected response type');
  }

  /**
   * Execute a GraphQL mutation
   */
  async executeMutation<TData>(
    mutation: string,
    variables?: Record<string, unknown>
  ): Promise<{ data: TData; errors?: ReadonlyArray<GraphQLFormattedError> }> {
    return this.executeQuery<TData>(mutation, variables);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    await this.server.stop();
  }
}

/**
 * Setup and teardown helpers for integration tests
 */
export class IntegrationTestHelper {
  private prisma: PrismaClient;
  private pubsub: PubSub;
  private testServer?: GraphQLTestServer;
  private originalArtNetEnabled: boolean;
  private originalBroadcastAddress: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.pubsub = new PubSub();
    this.originalArtNetEnabled = dmxService.isArtNetEnabled();
    this.originalBroadcastAddress = dmxService.getBroadcastAddress();
  }

  /**
   * Initialize test environment
   */
  async setup() {
    // Use a random high port for Art-Net to avoid conflicts
    // Port range 10000-60000 to avoid system ports and common application ports
    const randomPort = Math.floor(Math.random() * 50000) + 10000;
    process.env.ARTNET_PORT = randomPort.toString();

    // Ensure Art-Net is enabled for tests
    process.env.ARTNET_ENABLED = 'true';

    // Use localhost for Art-Net in tests
    process.env.ARTNET_BROADCAST = '127.0.0.1';

    // Initialize DMX service with test configuration
    // Stop first in case it was already running
    dmxService.stop();
    await dmxService.initialize();

    // Force broadcast address to localhost (overrides database setting)
    await dmxService.reloadBroadcastAddress('127.0.0.1');

    // Wait for DMX service output loop to start
    await new Promise(resolve => setTimeout(resolve, 200));

    // Reset and reinitialize preview service with test pubsub
    // This ensures the preview service uses the same pubsub instance as our tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resetPreviewService, getPreviewService } = require('../services/previewService');
    resetPreviewService();
    getPreviewService(this.prisma, this.pubsub);

    // Reset and reinitialize playback services with test pubsub
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resetPlaybackService, getPlaybackService } = require('../services/playbackService');
    resetPlaybackService();
    getPlaybackService(this.prisma, this.pubsub);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resetPlaybackStateService, getPlaybackStateService } = require('../services/playbackStateService');
    resetPlaybackStateService();
    getPlaybackStateService(this.prisma, this.pubsub);

    this.testServer = new GraphQLTestServer(this.prisma, this.pubsub);

    // Clean up any existing test data
    await this.testServer.dataFactory.cleanupAllTestData();

    return this.testServer;
  }

  /**
   * Clean up test environment
   */
  async teardown() {
    if (this.testServer) {
      // Clean up test data
      await this.testServer.dataFactory.cleanupAllTestData();

      // Stop GraphQL server
      await this.testServer.cleanup();
    }

    // Stop DMX service
    dmxService.stop();

    // Disconnect Prisma
    await this.prisma.$disconnect();

    // Restore original settings
    if (this.originalArtNetEnabled) {
      process.env.ARTNET_ENABLED = 'true';
    } else {
      process.env.ARTNET_ENABLED = 'false';
    }
    process.env.ARTNET_BROADCAST = this.originalBroadcastAddress;
  }

  /**
   * Reset database between tests
   */
  async resetDatabase() {
    if (this.testServer) {
      await this.testServer.dataFactory.cleanupAllTestData();
    }
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  getTestServer(): GraphQLTestServer {
    if (!this.testServer) {
      throw new Error('Test server not initialized. Call setup() first.');
    }
    return this.testServer;
  }
}

/**
 * Helper to wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition (${timeout}ms)`);
}

/**
 * Helper to wait for a specific amount of time
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Common GraphQL query fragments
 */
export const fragments = {
  projectFields: `
    id
    name
    description
    createdAt
    updatedAt
  `,

  fixtureFields: `
    id
    name
    manufacturer
    model
    type
    universe
    startChannel
    channelCount
  `,

  sceneFields: `
    id
    name
    description
    createdAt
    updatedAt
  `,

  cueFields: `
    id
    name
    cueNumber
    fadeInTime
    fadeOutTime
    followTime
    easingType
  `,
};

/**
 * Common GraphQL queries
 */
export const queries = {
  getProjects: `
    query GetProjects {
      projects {
        ${fragments.projectFields}
      }
    }
  `,

  getProject: `
    query GetProject($id: ID!) {
      project(id: $id) {
        ${fragments.projectFields}
        fixtures {
          ${fragments.fixtureFields}
        }
        scenes {
          ${fragments.sceneFields}
        }
      }
    }
  `,

  getScene: `
    query GetScene($id: ID!, $includeFixtureValues: Boolean = true) {
      scene(id: $id, includeFixtureValues: $includeFixtureValues) {
        ${fragments.sceneFields}
        fixtureValues {
          id
          fixture {
            ${fragments.fixtureFields}
          }
          channelValues
        }
      }
    }
  `,

  getDmxOutput: `
    query GetDmxOutput($universe: Int!) {
      dmxOutput(universe: $universe)
    }
  `,

  getAllDmxOutput: `
    query GetAllDmxOutput {
      allDmxOutput {
        universe
        channels
      }
    }
  `,
};

/**
 * Common GraphQL mutations
 */
export const mutations = {
  createProject: `
    mutation CreateProject($input: CreateProjectInput!) {
      createProject(input: $input) {
        ${fragments.projectFields}
      }
    }
  `,

  createScene: `
    mutation CreateScene($input: CreateSceneInput!) {
      createScene(input: $input) {
        ${fragments.sceneFields}
        fixtureValues {
          fixture {
            id
          }
          channelValues
        }
      }
    }
  `,

  setSceneLive: `
    mutation SetSceneLive($sceneId: ID!) {
      setSceneLive(sceneId: $sceneId)
    }
  `,

  setChannelValue: `
    mutation SetChannelValue($universe: Int!, $channel: Int!, $value: Int!) {
      setChannelValue(universe: $universe, channel: $channel, value: $value)
    }
  `,

  startPreviewSession: `
    mutation StartPreviewSession($projectId: ID!) {
      startPreviewSession(projectId: $projectId) {
        id
        isActive
        project {
          id
        }
      }
    }
  `,

  initializePreviewWithScene: `
    mutation InitializePreviewWithScene($sessionId: ID!, $sceneId: ID!) {
      initializePreviewWithScene(sessionId: $sessionId, sceneId: $sceneId)
    }
  `,

  commitPreviewSession: `
    mutation CommitPreviewSession($sessionId: ID!) {
      commitPreviewSession(sessionId: $sessionId)
    }
  `,

  createFixtureDefinition: `
    mutation CreateFixtureDefinition($input: CreateFixtureDefinitionInput!) {
      createFixtureDefinition(input: $input) {
        id
        manufacturer
        model
      }
    }
  `,

  createFixtureInstance: `
    mutation CreateFixtureInstance($input: CreateFixtureInstanceInput!) {
      createFixtureInstance(input: $input) {
        id
        name
        universe
        startChannel
      }
    }
  `,

  updateFixtureInstance: `
    mutation UpdateFixtureInstance($id: ID!, $input: UpdateFixtureInstanceInput!) {
      updateFixtureInstance(id: $id, input: $input) {
        id
        name
        universe
        startChannel
      }
    }
  `,

  createCueList: `
    mutation CreateCueList($input: CreateCueListInput!) {
      createCueList(input: $input) {
        id
        name
      }
    }
  `,

  createCue: `
    mutation CreateCue($input: CreateCueInput!) {
      createCue(input: $input) {
        id
        cueNumber
        name
      }
    }
  `,

  startCueList: `
    mutation StartCueList($cueListId: ID!) {
      startCueList(cueListId: $cueListId)
    }
  `,

  stopCueList: `
    mutation StopCueList($cueListId: ID!) {
      stopCueList(cueListId: $cueListId)
    }
  `,

  nextCue: `
    mutation NextCue($cueListId: ID!) {
      nextCue(cueListId: $cueListId)
    }
  `,

  createSceneBoard: `
    mutation CreateSceneBoard($input: CreateSceneBoardInput!) {
      createSceneBoard(input: $input) {
        id
        name
        defaultFadeTime
      }
    }
  `,

  addSceneToBoard: `
    mutation AddSceneToBoard($input: CreateSceneBoardButtonInput!) {
      addSceneToBoard(input: $input) {
        id
        layoutX
        layoutY
        scene {
          id
        }
      }
    }
  `,

  activateSceneFromBoard: `
    mutation ActivateSceneFromBoard($sceneBoardId: ID!, $sceneId: ID!, $fadeTimeOverride: Float) {
      activateSceneFromBoard(sceneBoardId: $sceneBoardId, sceneId: $sceneId, fadeTimeOverride: $fadeTimeOverride)
    }
  `,
};
