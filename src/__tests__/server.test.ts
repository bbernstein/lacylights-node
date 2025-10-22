import { LacyLightsServer, ServerConfig, ServerDependencies } from '../server';
import { setupWebSocketServer } from '../graphql/subscriptions';

// Mock WebSocket server setup
jest.mock('../graphql/subscriptions', () => ({
  setupWebSocketServer: jest.fn().mockReturnValue({
    dispose: jest.fn().mockResolvedValue(undefined)
  })
}));

// Mock Apollo Server
jest.mock('@apollo/server', () => ({
  ApolloServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock other dependencies
jest.mock('../context', () => ({
  createContext: jest.fn(),
  cleanup: jest.fn().mockResolvedValue(undefined),
  getSharedPrisma: jest.fn(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
  getSharedPubSub: jest.fn(() => ({
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  })),
}));

jest.mock('../graphql/schema', () => ({
  typeDefs: 'type Query { test: String }'
}));

jest.mock('../graphql/resolvers', () => ({
  resolvers: { Query: { test: () => 'test' } }
}));

describe('LacyLightsServer', () => {
  // Test timeout constants for performance optimization
  const FAST_TIMEOUT_FOR_TESTING_MS = 100;
  const SLOW_OPERATION_DELAY_MS = 200; // Exceeds FAST_TIMEOUT_FOR_TESTING_MS

  let mockDependencies: ServerDependencies;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockDependencies = {
      dmxService: {
        initialize: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn(),
      },
      fadeEngine: {
        stop: jest.fn(),
      },
      fixtureSetupService: {
        ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
      },
      playbackService: {
        cleanup: jest.fn(),
      },
      logger: mockLogger,
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should use default configuration when none provided', () => {
      const server = new LacyLightsServer();
      const config = server.getConfig();

      expect(config.port).toBe(4000);
      expect(config.corsOrigin).toBe('http://localhost:3000');
      expect(config.shutdownTimeout).toBe(10000);
      expect(config.operationTimeout).toBe(5000);
      expect(config.npmPackageVersion).toBe('1.0.1');
    });

    it('should use custom configuration when provided', () => {
      const customConfig: ServerConfig = {
        port: 8080,
        corsOrigin: 'https://example.com',
        shutdownTimeout: 15000,
        operationTimeout: 7000,
        npmPackageVersion: '2.0.0',
      };

      const server = new LacyLightsServer(customConfig);
      const config = server.getConfig();

      expect(config).toEqual(customConfig);
    });

    it('should merge partial configuration with defaults', () => {
      const partialConfig: ServerConfig = {
        port: 9000,
        corsOrigin: 'https://test.com',
      };

      const server = new LacyLightsServer(partialConfig);
      const config = server.getConfig();

      expect(config.port).toBe(9000);
      expect(config.corsOrigin).toBe('https://test.com');
      expect(config.shutdownTimeout).toBe(10000); // default
      expect(config.operationTimeout).toBe(5000); // default
    });

    it('should use environment variables when available', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        PORT: '5000',
        CORS_ORIGIN: 'https://env.com',
        npm_package_version: '3.0.0',
      };

      const server = new LacyLightsServer();
      const config = server.getConfig();

      expect(config.port).toBe(5000);
      expect(config.corsOrigin).toBe('https://env.com');
      expect(config.npmPackageVersion).toBe('3.0.0');

      process.env = originalEnv;
    });

    it('should use custom dependencies when provided', () => {
      const server = new LacyLightsServer({}, mockDependencies);
      const deps = server.getDependencies();

      expect(deps.dmxService).toBe(mockDependencies.dmxService);
      expect(deps.fadeEngine).toBe(mockDependencies.fadeEngine);
      expect(deps.logger).toBe(mockDependencies.logger);
      expect(deps.playbackService).toBe(mockDependencies.playbackService);
      expect(deps.fixtureSetupService).toBe(mockDependencies.fixtureSetupService);
    });
  });

  describe('Express App Creation', () => {
    it('should create express app with health check', () => {
      const server = new LacyLightsServer({}, mockDependencies);
      const app = server.createExpressApp();

      expect(app).toBeDefined();
      expect(typeof app).toBe('function'); // Express app is a function
    });

    it('should setup health check endpoint correctly', () => {
      const server = new LacyLightsServer({
        npmPackageVersion: '1.2.3',
      }, mockDependencies);

      const mockApp = {
        get: jest.fn(),
      } as any;

      server.setupHealthCheck(mockApp);

      expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));

      // Test the health check handler
      const healthCheckHandler = mockApp.get.mock.calls[0][1];
      const mockReq = {};
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // Mock process.uptime
      const originalUptime = process.uptime;
      process.uptime = jest.fn().mockReturnValue(123.45);

      healthCheckHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: 123.45,
        version: '1.2.3',
      });

      process.uptime = originalUptime;
    });
  });

  describe('Service Initialization', () => {
    it('should initialize services in correct order', async () => {
      const server = new LacyLightsServer({}, mockDependencies);

      await server.initializeServices();

      expect(mockDependencies.fixtureSetupService.ensureFixturesPopulated).toHaveBeenCalledTimes(1);
      expect(mockDependencies.dmxService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const initError = new Error('Initialization failed');
      mockDependencies.dmxService.initialize = jest.fn().mockRejectedValue(initError);

      const server = new LacyLightsServer({}, mockDependencies);

      await expect(server.initializeServices()).rejects.toThrow('Initialization failed');
    });
  });

  describe('Service Cleanup', () => {
    it('should cleanup services in correct order', async () => {
      const server = new LacyLightsServer({}, mockDependencies);

      await server.cleanupServices();

      // Verify all cleanup methods were called
      expect(mockDependencies.dmxService.stop).toHaveBeenCalledTimes(1);
      expect(mockDependencies.fadeEngine.stop).toHaveBeenCalledTimes(1);
      expect(mockDependencies.playbackService.cleanup).toHaveBeenCalledTimes(1);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith('🎭 Stopping DMX service...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ DMX service stopped');
      expect(mockLogger.info).toHaveBeenCalledWith('🎬 Stopping fade engine...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ Fade engine stopped');
      expect(mockLogger.info).toHaveBeenCalledWith('🎵 Cleaning up playback service...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ Playback service cleaned up');
    });

    it('should handle cleanup errors gracefully', async () => {
      const cleanupError = new Error('Cleanup failed');
      mockDependencies.dmxService.stop = jest.fn().mockImplementation(() => {
        throw cleanupError;
      });

      const server = new LacyLightsServer({}, mockDependencies);

      await server.cleanupServices();

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Error stopping DMX service:', {
        error: cleanupError,
      });

      // Other services should still be cleaned up
      expect(mockDependencies.fadeEngine.stop).toHaveBeenCalledTimes(1);
      expect(mockDependencies.playbackService.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('Shutdown Logic', () => {
    it('should prevent multiple concurrent shutdowns', async () => {
      const server = new LacyLightsServer({}, mockDependencies);

      // Start two shutdown processes
      const shutdown1 = server.shutdown();
      const shutdown2 = server.shutdown();

      await Promise.all([shutdown1, shutdown2]);

      expect(mockLogger.warn).toHaveBeenCalledWith('⚠️ Shutdown already in progress...');
      expect(server.isShutdownInProgress()).toBe(true);
    });

    it('should log shutdown initiation', async () => {
      const server = new LacyLightsServer({}, mockDependencies);

      await server.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('🔄 Graceful shutdown initiated...');
      expect(mockLogger.info).toHaveBeenCalledWith('👋 Server shutdown complete');
    });
  });

  describe('State Management', () => {
    it('should track shutdown state correctly', () => {
      const server = new LacyLightsServer({}, mockDependencies);

      expect(server.isShutdownInProgress()).toBe(false);

      // Start shutdown (don't await to test intermediate state)
      server.shutdown();

      expect(server.isShutdownInProgress()).toBe(true);
    });

    it('should return null for server instances initially', () => {
      const server = new LacyLightsServer({}, mockDependencies);

      expect(server.getServerInstances()).toBeNull();
    });
  });

  describe('Apollo Server Creation', () => {
    it('should create Apollo server with correct plugins', () => {
      const server = new LacyLightsServer({}, mockDependencies);
      const mockHttpServer = {
        on: jest.fn(),
        listen: jest.fn(),
        close: jest.fn()
      } as any;

      const apolloServer = server.createApolloServer(mockHttpServer);

      expect(apolloServer).toBeDefined();
    });

    it('should create Apollo server with plugins', async () => {
      const mockWsServer = {
        dispose: jest.fn().mockResolvedValue(undefined)
      };

      const mockSetupWebSocketServer = (setupWebSocketServer as jest.MockedFunction<typeof setupWebSocketServer>);
      mockSetupWebSocketServer.mockReturnValue(mockWsServer);

      const server = new LacyLightsServer({}, mockDependencies);
      const mockHttpServer = {
        on: jest.fn(),
        listen: jest.fn(),
        close: jest.fn()
      } as any;

      const apolloServer = server.createApolloServer(mockHttpServer);

      // Verify Apollo server was created
      expect(apolloServer).toBeDefined();

      // Verify WebSocket server setup was called
      expect(mockSetupWebSocketServer).toHaveBeenCalledWith(mockHttpServer);

      // The internal plugin functionality will be tested through integration
      // as the Apollo Server's internal config is not directly accessible
    });
  });

  describe('Signal Handlers', () => {
    let server: LacyLightsServer;
    let originalProcessOn: any;
    let processHandlers: Map<string, (...args: any[]) => void>;

    beforeEach(() => {
      server = new LacyLightsServer({}, mockDependencies);
      processHandlers = new Map();

      originalProcessOn = process.on;
      process.on = jest.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
        processHandlers.set(event, handler);
        return process;
      });

      jest.spyOn(server, 'shutdown').mockResolvedValue();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    it('should setup all required signal handlers', () => {
      server.setupSignalHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should handle SIGINT signal correctly', () => {
      server.setupSignalHandlers();

      const sigintHandler = processHandlers.get('SIGINT');
      sigintHandler?.();

      expect(mockLogger.info).toHaveBeenCalledWith('\n📡 Received SIGINT signal');
      expect(server.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should handle SIGTERM signal correctly', () => {
      server.setupSignalHandlers();

      const sigtermHandler = processHandlers.get('SIGTERM');
      sigtermHandler?.();

      expect(mockLogger.info).toHaveBeenCalledWith('\n📡 Received SIGTERM signal');
      expect(server.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should handle uncaught exceptions', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      server.setupSignalHandlers();

      const uncaughtHandler = processHandlers.get('uncaughtException');
      const testError = new Error('Test uncaught exception');

      expect(() => uncaughtHandler?.(testError)).toThrow('process.exit called');
      expect(mockLogger.error).toHaveBeenCalledWith('💥 Uncaught exception:', { error: testError });
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle unhandled rejections and trigger shutdown', async () => {
      server.setupSignalHandlers();

      const rejectionHandler = processHandlers.get('unhandledRejection');
      const testReason = new Error('Test unhandled rejection');
      const testPromise = Promise.resolve(); // Use a resolved promise to avoid actual rejection

      rejectionHandler?.(testReason, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith('💥 Unhandled rejection at:', {
        promise: testPromise,
        reason: testReason,
      });
      expect(server.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('Server Startup Components', () => {
    it('should call initializeServices with correct sequence', async () => {
      const server = new LacyLightsServer({}, mockDependencies);

      await server.initializeServices();

      expect(mockDependencies.fixtureSetupService.ensureFixturesPopulated).toHaveBeenCalledTimes(1);
      expect(mockDependencies.dmxService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle service initialization errors', async () => {
      const server = new LacyLightsServer({}, mockDependencies);
      const initError = new Error('Service init failed');
      mockDependencies.dmxService.initialize = jest.fn().mockRejectedValue(initError);

      await expect(server.initializeServices()).rejects.toThrow('Service init failed');
    });
  });

  describe('WebSocket Shutdown', () => {
    let server: LacyLightsServer;
    let mockWsServer: any;

    beforeEach(() => {
      mockWsServer = {
        dispose: jest.fn().mockResolvedValue(undefined)
      };

      server = new LacyLightsServer({}, mockDependencies);
      (server as any).serverInstances = {
        server: { close: jest.fn() },
        wsServer: mockWsServer
      };
    });

    it('should shutdown WebSocket server successfully', async () => {
      await server.shutdownWebSocket();

      expect(mockWsServer.dispose).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('🔌 Closing WebSocket server...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ WebSocket server closed');
    });

    it('should handle WebSocket disposal timeout', async () => {
      // Create server with short timeout for faster testing
      const fastTimeoutServer = new LacyLightsServer({ operationTimeout: FAST_TIMEOUT_FOR_TESTING_MS }, mockDependencies);
      (fastTimeoutServer as any).serverInstances = {
        server: { close: jest.fn() },
        wsServer: mockWsServer
      };

      mockWsServer.dispose = jest.fn().mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, SLOW_OPERATION_DELAY_MS))
      );

      await fastTimeoutServer.shutdownWebSocket();

      expect(mockLogger.info).toHaveBeenCalledWith('✅ WebSocket server closed (with expected cleanup warnings)');
    });

    it('should handle WebSocket server not running error', async () => {
      const notRunningError = new Error('server is not running');
      mockWsServer.dispose = jest.fn().mockRejectedValue(notRunningError);

      await server.shutdownWebSocket();

      expect(mockLogger.info).toHaveBeenCalledWith('✅ WebSocket server closed (with expected cleanup warnings)');
    });

    it('should handle WebSocket server already closed error', async () => {
      const closedError = new Error('WebSocket server is already closed');
      mockWsServer.dispose = jest.fn().mockRejectedValue(closedError);

      await server.shutdownWebSocket();

      expect(mockLogger.info).toHaveBeenCalledWith('✅ WebSocket server closed (with expected cleanup warnings)');
    });

    it('should handle unexpected WebSocket errors', async () => {
      const unexpectedError = new Error('Unexpected WebSocket error');
      mockWsServer.dispose = jest.fn().mockRejectedValue(unexpectedError);

      await server.shutdownWebSocket();

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Unexpected error closing WebSocket server:', {
        error: unexpectedError
      });
    });

    it('should skip WebSocket shutdown when no server instances', async () => {
      (server as any).serverInstances = null;

      await server.shutdownWebSocket();

      expect(mockWsServer.dispose).not.toHaveBeenCalled();
    });
  });

  describe('HTTP Server Shutdown', () => {
    let server: LacyLightsServer;
    let mockHttpServer: any;

    beforeEach(() => {
      mockHttpServer = {
        close: jest.fn((callback) => callback && callback())
      };

      server = new LacyLightsServer({}, mockDependencies);
      (server as any).serverInstances = {
        server: mockHttpServer,
        wsServer: { dispose: jest.fn() }
      };
    });

    it('should shutdown HTTP server successfully', async () => {
      await server.shutdownHttpServer();

      expect(mockHttpServer.close).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('🌐 Closing HTTP server...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ HTTP server closed');
    });

    it('should handle HTTP server close timeout', async () => {
      // Create server with short timeout for faster testing
      const fastTimeoutServer = new LacyLightsServer({ operationTimeout: FAST_TIMEOUT_FOR_TESTING_MS }, mockDependencies);
      const slowHttpServer = {
        close: jest.fn().mockImplementation(() => {
          // Never call callback to simulate timeout
        })
      };
      (fastTimeoutServer as any).serverInstances = {
        server: slowHttpServer,
        wsServer: { dispose: jest.fn() }
      };

      await fastTimeoutServer.shutdownHttpServer();

      expect(mockLogger.info).toHaveBeenCalledWith('✅ HTTP server closed (timeout - likely closed)');
    });

    it('should handle HTTP server close error', async () => {
      const closeError = new Error('HTTP close error');
      mockHttpServer.close = jest.fn((callback) => callback && callback(closeError));

      await server.shutdownHttpServer();

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Error closing HTTP server:', { error: closeError });
    });

    it('should skip HTTP shutdown when no server instances', async () => {
      (server as any).serverInstances = null;

      await server.shutdownHttpServer();

      expect(mockHttpServer.close).not.toHaveBeenCalled();
    });
  });

  describe('Shutdown Without Process Exit', () => {
    let server: LacyLightsServer;

    beforeEach(() => {
      server = new LacyLightsServer({}, mockDependencies);
    });

    it('should log shutdown initiation and completion', async () => {
      jest.spyOn(server, 'shutdownWebSocket').mockResolvedValue();
      jest.spyOn(server, 'shutdownHttpServer').mockResolvedValue();
      jest.spyOn(server, 'cleanupServices').mockResolvedValue();

      // Mock setTimeout to prevent actual timer
      const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ unref: jest.fn() } as any));

      await server.shutdown();

      expect(server.shutdownWebSocket).toHaveBeenCalledTimes(1);
      expect(server.shutdownHttpServer).toHaveBeenCalledTimes(1);
      expect(server.cleanupServices).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('🔄 Graceful shutdown initiated...');
      expect(mockLogger.info).toHaveBeenCalledWith('👋 Server shutdown complete');

      mockSetTimeout.mockRestore();
    });

    it('should handle shutdown errors gracefully', async () => {
      const shutdownError = new Error('Shutdown failed');
      jest.spyOn(server, 'shutdownWebSocket').mockRejectedValue(shutdownError);
      jest.spyOn(server, 'shutdownHttpServer').mockResolvedValue();
      jest.spyOn(server, 'cleanupServices').mockResolvedValue();

      // Mock setTimeout to prevent actual timer
      const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ unref: jest.fn() } as any));

      await server.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith('❌ Error during service cleanup:', { error: shutdownError });
      expect(mockLogger.info).toHaveBeenCalledWith('👋 Server shutdown complete');

      mockSetTimeout.mockRestore();
    });

    it('should skip process.exit timeout in test environment', async () => {
      const server = new LacyLightsServer();
      jest.spyOn(server, 'shutdownWebSocket').mockResolvedValue();
      jest.spyOn(server, 'shutdownHttpServer').mockResolvedValue();
      jest.spyOn(server, 'cleanupServices').mockResolvedValue();

      const mockSetTimeout = jest.spyOn(global, 'setTimeout');

      // Ensure NODE_ENV is set to test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await server.shutdown();

      // setTimeout should not be called when NODE_ENV is test
      expect(mockSetTimeout).not.toHaveBeenCalled();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
      mockSetTimeout.mockRestore();
    });

    it('should set process.exit timeout in non-test environment', async () => {
      const server = new LacyLightsServer();
      jest.spyOn(server, 'shutdownWebSocket').mockResolvedValue();
      jest.spyOn(server, 'shutdownHttpServer').mockResolvedValue();
      jest.spyOn(server, 'cleanupServices').mockResolvedValue();

      const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ unref: jest.fn() } as any));

      // Set NODE_ENV to production to trigger timeout
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await server.shutdown();

      // setTimeout should be called when NODE_ENV is not test
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);

      // Restore environment
      process.env.NODE_ENV = originalEnv;
      mockSetTimeout.mockRestore();
    });
  });
});