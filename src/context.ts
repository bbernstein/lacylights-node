import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { PubSub } from 'graphql-subscriptions';

export interface Context {
  prisma: PrismaClient;
  req?: Request;
  res?: Response;
  pubsub: PubSub;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export interface WebSocketContext {
  prisma: PrismaClient;
  pubsub: PubSub;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Shared service instances - these should be created once and reused
 * across all contexts for the lifetime of the application
 */
let sharedPrisma: PrismaClient | null = null;
let sharedPubSub: PubSub | null = null;

export function getSharedPrisma(): PrismaClient {
  if (!sharedPrisma) {
    sharedPrisma = new PrismaClient();
  }
  return sharedPrisma;
}

export function getSharedPubSub(): PubSub {
  if (!sharedPubSub) {
    sharedPubSub = new PubSub();
  }
  return sharedPubSub;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  // TODO: Implement authentication logic here
  return {
    prisma: getSharedPrisma(),
    req,
    res,
    pubsub: getSharedPubSub()
  };
}

export async function createWebSocketContext(): Promise<WebSocketContext> {
  // TODO: Implement WebSocket authentication logic here
  return {
    prisma: getSharedPrisma(),
    pubsub: getSharedPubSub()
  };
}

/**
 * Cleanup function for graceful shutdown
 */
export async function cleanup(): Promise<void> {
  if (sharedPrisma) {
    await sharedPrisma.$disconnect();
    sharedPrisma = null;
  }
  // PubSub doesn't need explicit cleanup
  sharedPubSub = null;
}

// Export the shared PubSub for services that need to publish events
export const pubsub = getSharedPubSub();
