import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

export interface Context {
  prisma: PrismaClient;
  req: Request;
  res: Response;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const prisma = new PrismaClient();

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  // TODO: Implement authentication logic here
  return { prisma, req, res };
}
