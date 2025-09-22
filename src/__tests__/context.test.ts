import type { Request, Response } from 'express';

// Create mock functions that will be captured by the mock
const mockDisconnect = jest.fn();
const mockPublish = jest.fn();
const mockAsyncIterator = jest.fn();

// Create the mock PrismaClient class
const MockPrismaClient = jest.fn().mockImplementation(() => ({
  $disconnect: mockDisconnect,
}));

// Mock Prisma and PubSub before importing context
jest.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

jest.mock('graphql-subscriptions', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    asyncIterator: mockAsyncIterator,
  })),
}));

// Import context functions after mocking
import {
  createContext,
  createWebSocketContext,
  getSharedPrisma,
  getSharedPubSub,
  cleanup
} from '../context';

describe('Context', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockRequest = {};
    mockResponse = {};

    // Clear mock call counts but preserve implementation
    mockDisconnect.mockClear();
    mockPublish.mockClear();
    mockAsyncIterator.mockClear();

    // Clean up any existing instances
    try {
      await cleanup();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('getSharedPrisma', () => {
    it('should return the same PrismaClient instance on multiple calls', () => {
      const prisma1 = getSharedPrisma();
      const prisma2 = getSharedPrisma();

      expect(prisma1).toBe(prisma2);
    });
  });

  describe('getSharedPubSub', () => {
    it('should return the same PubSub instance on multiple calls', () => {
      const pubsub1 = getSharedPubSub();
      const pubsub2 = getSharedPubSub();

      expect(pubsub1).toBe(pubsub2);
    });
  });

  describe('createContext', () => {
    it('should create context with shared instances', async () => {
      const context = await createContext({
        req: mockRequest as Request,
        res: mockResponse as Response,
      });

      expect(context).toHaveProperty('prisma');
      expect(context).toHaveProperty('pubsub');
      expect(context).toHaveProperty('req', mockRequest);
      expect(context).toHaveProperty('res', mockResponse);
      expect(context.user).toBeUndefined();
    });

    it('should use the same shared instances across multiple contexts', async () => {
      const context1 = await createContext({
        req: mockRequest as Request,
        res: mockResponse as Response,
      });

      const context2 = await createContext({
        req: mockRequest as Request,
        res: mockResponse as Response,
      });

      expect(context1.prisma).toBe(context2.prisma);
      expect(context1.pubsub).toBe(context2.pubsub);
    });
  });

  describe('createWebSocketContext', () => {
    it('should create websocket context with shared instances', async () => {
      const context = await createWebSocketContext();

      expect(context).toHaveProperty('prisma');
      expect(context).toHaveProperty('pubsub');
      expect(context).not.toHaveProperty('req');
      expect(context).not.toHaveProperty('res');
      expect(context.user).toBeUndefined();
    });

    it('should use the same shared instances as HTTP context', async () => {
      const httpContext = await createContext({
        req: mockRequest as Request,
        res: mockResponse as Response,
      });

      const wsContext = await createWebSocketContext();

      expect(httpContext.prisma).toBe(wsContext.prisma);
      expect(httpContext.pubsub).toBe(wsContext.pubsub);
    });
  });

  describe('cleanup', () => {
    it('should disconnect prisma and clear cached instances', async () => {
      const prisma = getSharedPrisma();
      const pubsub = getSharedPubSub();

      // Manually add the $disconnect method to the prisma mock
      prisma.$disconnect = mockDisconnect;

      // Verify instances are cached
      expect(getSharedPrisma()).toBe(prisma);
      expect(getSharedPubSub()).toBe(pubsub);

      await cleanup();

      // Verify prisma disconnect was called
      expect(mockDisconnect).toHaveBeenCalled();

      // Verify new instances are created after cleanup
      const newPrisma = getSharedPrisma();
      const newPubsub = getSharedPubSub();

      expect(newPrisma).not.toBe(prisma);
      expect(newPubsub).not.toBe(pubsub);
    });

    it('should handle multiple cleanup calls gracefully', async () => {
      const prisma = getSharedPrisma();

      // Manually add the $disconnect method to the prisma mock
      prisma.$disconnect = mockDisconnect;

      await cleanup();
      await cleanup(); // Second cleanup should not throw

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });
  });
});