import type { Request, Response } from "express";
import {
  getSharedPrisma,
  getSharedPubSub,
  createContext,
  createWebSocketContext,
  cleanup,
} from "../context";

// Mock dependencies
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("graphql-subscriptions", () => ({
  PubSub: jest.fn().mockImplementation(() => ({})),
}));

describe("Context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSharedPrisma", () => {
    it("should return a PrismaClient instance", () => {
      const prisma = getSharedPrisma();
      expect(prisma).toBeDefined();
    });

    it("should return the same instance on subsequent calls", () => {
      const prisma1 = getSharedPrisma();
      const prisma2 = getSharedPrisma();
      expect(prisma1).toBe(prisma2);
    });
  });

  describe("getSharedPubSub", () => {
    it("should return a PubSub instance", () => {
      const pubsub = getSharedPubSub();
      expect(pubsub).toBeDefined();
    });

    it("should return the same instance on subsequent calls", () => {
      const pubsub1 = getSharedPubSub();
      const pubsub2 = getSharedPubSub();
      expect(pubsub1).toBe(pubsub2);
    });
  });

  describe("createContext", () => {
    it("should create context with shared instances", async () => {
      const mockReq = {} as Request;
      const mockRes = {} as Response;

      const context = await createContext({
        req: mockReq,
        res: mockRes,
      });

      expect(context).toEqual({
        prisma: expect.any(Object),
        req: mockReq,
        res: mockRes,
        pubsub: expect.any(Object),
      });
    });
  });

  describe("createWebSocketContext", () => {
    it("should create WebSocket context with shared instances", async () => {
      const context = await createWebSocketContext();

      expect(context).toEqual({
        prisma: expect.any(Object),
        pubsub: expect.any(Object),
      });
    });
  });

  describe("cleanup", () => {
    it("should handle cleanup gracefully", async () => {
      await expect(cleanup()).resolves.not.toThrow();
    });
  });
});