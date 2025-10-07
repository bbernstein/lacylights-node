import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { PubSub } from "graphql-subscriptions";

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

    // Middleware to automatically serialize/deserialize channelValues for SQLite
    // Skip in test environment since Prisma is mocked
    if (process.env.NODE_ENV !== 'test' && typeof sharedPrisma.$use === 'function') {
      sharedPrisma.$use(async (params, next) => {
      const serializeChannelValues = (item: any) => {
        if (item && item.channelValues && Array.isArray(item.channelValues)) {
          item.channelValues = JSON.stringify(item.channelValues);
        }
      };

      const serializeFixtureValues = (data: any) => {
        if (!data) {return;}

        // Handle direct FixtureValue operations
        if (params.model === 'FixtureValue') {
          if (Array.isArray(data)) {
            data.forEach(serializeChannelValues);
          } else {
            serializeChannelValues(data);
          }
        }

        // Handle nested FixtureValue in Scene operations
        if (params.model === 'Scene' && data.fixtureValues) {
          if (data.fixtureValues.create) {
            const creates = Array.isArray(data.fixtureValues.create) ? data.fixtureValues.create : [data.fixtureValues.create];
            creates.forEach(serializeChannelValues);
          }
          if (data.fixtureValues.update) {
            const updates = Array.isArray(data.fixtureValues.update) ? data.fixtureValues.update : [data.fixtureValues.update];
            updates.forEach((u: any) => serializeChannelValues(u.data || u));
          }
        }
      };

      // Serialize before write operations
      if (params.action === 'create' || params.action === 'update' || params.action === 'createMany' || params.action === 'updateMany') {
        serializeFixtureValues(params.args.data);
      }

      const result = await next(params);

      // Deserialize after read operations
      const deserialize = (item: any) => {
        if (item && item.channelValues && typeof item.channelValues === 'string') {
          try {
            item.channelValues = JSON.parse(item.channelValues);
          } catch {
            item.channelValues = [];
          }
        }
        return item;
      };

      const deserializeResult = (result: any) => {
        if (!result) {return result;}

        // Handle FixtureValue results
        if (params.model === 'FixtureValue') {
          if (Array.isArray(result)) {
            result.forEach(deserialize);
          } else {
            deserialize(result);
          }
        }

        // Handle Scene results with nested fixtureValues
        if (params.model === 'Scene') {
          if (Array.isArray(result)) {
            result.forEach((scene: any) => {
              if (scene.fixtureValues) {
                scene.fixtureValues.forEach(deserialize);
              }
            });
          } else if (result.fixtureValues) {
            result.fixtureValues.forEach(deserialize);
          }
        }

        return result;
      };

      return deserializeResult(result);
    });
    }
  }
  return sharedPrisma;
}

export function getSharedPubSub(): PubSub {
  if (!sharedPubSub) {
    sharedPubSub = new PubSub();
  }
  return sharedPubSub;
}

export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<Context> {
  // TODO: Implement authentication logic here
  return {
    prisma: getSharedPrisma(),
    req,
    res,
    pubsub: getSharedPubSub(),
  };
}

export async function createWebSocketContext(): Promise<WebSocketContext> {
  // TODO: Implement WebSocket authentication logic here
  return {
    prisma: getSharedPrisma(),
    pubsub: getSharedPubSub(),
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

// Export the shared instances for services that need them
export const prisma = getSharedPrisma();
export const pubsub = getSharedPubSub();
