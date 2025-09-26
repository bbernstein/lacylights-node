import { Server } from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { setupWebSocketServer } from "../subscriptions";

// Mock dependencies
jest.mock("ws", () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock("graphql-ws/lib/use/ws", () => ({
  useServer: jest.fn().mockReturnValue({
    dispose: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@graphql-tools/schema", () => ({
  makeExecutableSchema: jest.fn().mockReturnValue({
    getType: jest.fn(),
  }),
}));

jest.mock("../schema", () => ({
  typeDefs: "type Query { test: String }",
}));

jest.mock("../resolvers", () => ({
  resolvers: {
    Query: {
      test: () => "test",
    },
  },
}));

jest.mock("../../context", () => ({
  createWebSocketContext: jest.fn().mockResolvedValue({
    userId: "test-user",
  }),
}));

const mockWebSocketServer = WebSocketServer as jest.MockedClass<typeof WebSocketServer>;
const mockUseServer = useServer as jest.MockedFunction<typeof useServer>;
const mockMakeExecutableSchema = makeExecutableSchema as jest.MockedFunction<typeof makeExecutableSchema>;

describe("GraphQL Subscriptions", () => {
  let mockHttpServer: Server;
  let mockWsServer: any;
  let mockServerCleanup: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTTP server
    mockHttpServer = {
      on: jest.fn(),
      listen: jest.fn(),
      close: jest.fn(),
    } as any;

    // Mock WebSocket server instance
    mockWsServer = {
      on: jest.fn(),
      close: jest.fn(),
    };

    // Mock server cleanup functions
    mockServerCleanup = {
      dispose: jest.fn().mockResolvedValue(undefined),
    };

    // Setup mocks
    mockWebSocketServer.mockImplementation(() => mockWsServer);
    mockUseServer.mockReturnValue(mockServerCleanup);
    mockMakeExecutableSchema.mockReturnValue({
      getType: jest.fn(),
    } as any);
  });

  describe("setupWebSocketServer", () => {
    it("should create WebSocket server with correct configuration", () => {
      const result = setupWebSocketServer(mockHttpServer);

      expect(mockWebSocketServer).toHaveBeenCalledWith({
        server: mockHttpServer,
        path: "/graphql",
      });

      expect(result).toBe(mockServerCleanup);
    });

    it("should create executable schema with typeDefs and resolvers", () => {
      setupWebSocketServer(mockHttpServer);

      expect(mockMakeExecutableSchema).toHaveBeenCalledWith({
        typeDefs: "type Query { test: String }",
        resolvers: {
          Query: {
            test: expect.any(Function),
          },
        },
      });
    });

    it("should setup GraphQL WebSocket server with useServer", () => {
      const mockSchema = { getType: jest.fn() };
      mockMakeExecutableSchema.mockReturnValue(mockSchema as any);

      setupWebSocketServer(mockHttpServer);

      expect(mockUseServer).toHaveBeenCalledWith(
        {
          schema: mockSchema,
          context: expect.any(Function),
        },
        mockWsServer,
      );
    });

    it("should create context function that is async", () => {
      setupWebSocketServer(mockHttpServer);

      const useServerCall = mockUseServer.mock.calls[0];
      const contextFunction = (useServerCall[0] as any).context;

      expect(contextFunction).toBeDefined();
      expect(typeof contextFunction).toBe("function");

      // The function should be async
      const result = contextFunction({}, {}, {});
      expect(result instanceof Promise).toBe(true);
    });

    it("should return server cleanup object", () => {
      const result = setupWebSocketServer(mockHttpServer);

      expect(result).toBe(mockServerCleanup);
      expect(result.dispose).toBeDefined();
      expect(typeof result.dispose).toBe("function");
    });

    it("should create context function that accepts the expected parameters", () => {
      setupWebSocketServer(mockHttpServer);

      const useServerCall = mockUseServer.mock.calls[0];
      const contextFunction = (useServerCall[0] as any).context;

      // Test that the function accepts the expected parameters without throwing
      expect(() => {
        const mockCtx = { connectionParams: { authorization: "Bearer token" } };
        const mockMsg = { type: "connection_init" };
        const mockArgs = { query: "query { test }" };

        const result = contextFunction(mockCtx, mockMsg, mockArgs);
        expect(result instanceof Promise).toBe(true);
      }).not.toThrow();
    });

    it("should create unique WebSocket server instances for different HTTP servers", () => {
      const httpServer1 = { on: jest.fn() } as any;
      const httpServer2 = { on: jest.fn() } as any;

      const cleanup1 = setupWebSocketServer(httpServer1);
      const cleanup2 = setupWebSocketServer(httpServer2);

      expect(mockWebSocketServer).toHaveBeenCalledTimes(2);
      expect(mockWebSocketServer).toHaveBeenNthCalledWith(1, {
        server: httpServer1,
        path: "/graphql",
      });
      expect(mockWebSocketServer).toHaveBeenNthCalledWith(2, {
        server: httpServer2,
        path: "/graphql",
      });

      expect(cleanup1).toBe(mockServerCleanup);
      expect(cleanup2).toBe(mockServerCleanup);
    });

    it("should handle server cleanup disposal", async () => {
      const result = setupWebSocketServer(mockHttpServer);

      await result.dispose();

      expect(mockServerCleanup.dispose).toHaveBeenCalled();
    });
  });
});