import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
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

const prisma = new PrismaClient();
const pubsub = new PubSub();

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  // TODO: Implement authentication logic here
  return { prisma, req, res, pubsub };
}

export async function createWebSocketContext(): Promise<WebSocketContext> {
  // TODO: Implement WebSocket authentication logic here
  return { prisma, pubsub };
}

export { pubsub };
