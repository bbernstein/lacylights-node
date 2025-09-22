import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { createContext, cleanup } from './context';
import { setupWebSocketServer } from './graphql/subscriptions';
import { dmxService } from './services/dmx';
import { fadeEngine } from './services/fadeEngine';
import { FixtureSetupService } from './services/fixtureSetupService';
import { playbackService } from './services/playbackService';
import { logger } from './utils/logger';

// Graceful shutdown timeout in milliseconds
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;

// Individual operation timeout in milliseconds (for WebSocket and HTTP server cleanup)
const SHUTDOWN_OPERATION_TIMEOUT = 5000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Setup WebSocket server for subscriptions
  const wsServer = setupWebSocketServer(httpServer);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              wsServer.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    }),
    express.json({ limit: '50mb' }),
    expressMiddleware(server, {
      context: createContext,
    }),
  );

  // Ensure fixtures are populated before starting services
  await FixtureSetupService.ensureFixturesPopulated();

  // Start DMX service
  await dmxService.initialize();

  const PORT = process.env.PORT || 4000;
  const httpListener = httpServer.listen(PORT, () => {
    logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`🔌 Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });

  // Return server instance for graceful shutdown
  return { server: httpListener, wsServer };
}

// Keep reference to server instances for graceful shutdown
// Note: Module-level variable is necessary here to maintain references across async operations
// and signal handlers. This is a common pattern for graceful shutdown in Node.js applications.
let serverInstances: { server: http.Server; wsServer: ReturnType<typeof setupWebSocketServer> } | null = null;

// Flag to prevent multiple concurrent shutdown attempts
let isShuttingDown = false;

// Graceful shutdown handler
async function gracefulShutdown() {
  // Prevent multiple concurrent shutdown attempts
  if (isShuttingDown) {
    logger.warn('⚠️ Shutdown already in progress...');
    return;
  }
  isShuttingDown = true;
  
  logger.info('🔄 Graceful shutdown initiated...');

  try {
    // Close WebSocket server first to avoid "server is not running" errors
    if (serverInstances?.wsServer) {
      logger.info('🔌 Closing WebSocket server...');
      try {
        // Set a timeout for WebSocket disposal to prevent hanging
        const webSocketTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('WebSocket disposal timeout')), SHUTDOWN_OPERATION_TIMEOUT)
        );
        
        await Promise.race([
          serverInstances.wsServer.dispose(),
          webSocketTimeout
        ]);
        logger.info('✅ WebSocket server closed');
      } catch (err: unknown) {
        // Suppress expected WebSocket disposal errors during shutdown, log unexpected ones
        if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && (
          err.message.includes('server is not running') ||
          err.message.includes('WebSocket server is already closed') ||
          err.message.includes('WebSocket disposal timeout')
        )) {
          logger.info('✅ WebSocket server closed (with expected cleanup warnings)');
        } else {
          logger.error('❌ Unexpected error closing WebSocket server:', { error: err });
        }
      }
    }

    // Close HTTP server after WebSocket server
    if (serverInstances?.server) {
      logger.info('🌐 Closing HTTP server...');
      const httpServerInstance = serverInstances.server;
      try {
        const httpTimeout = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('HTTP server close timeout')), SHUTDOWN_OPERATION_TIMEOUT)
        );
        
        const httpClose = new Promise<void>((resolve, reject) => {
          httpServerInstance.close((err) => {
            if (err) {
              logger.error('❌ Error closing HTTP server:', { error: err });
              reject(err);
            } else {
              logger.info('✅ HTTP server closed');
              resolve();
            }
          });
        });

        await Promise.race([httpClose, httpTimeout]);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'message' in err && err.message === 'HTTP server close timeout') {
          logger.info('✅ HTTP server closed (timeout - likely closed)');
        } else {
          logger.error('❌ Error closing HTTP server:', { error: err });
        }
      }
    }

    // Stop services in reverse order of initialization
    // Note: These stop() methods are currently synchronous, but we wrap them in try-catch for safety
    logger.info('🎭 Stopping DMX service...');
    try {
      dmxService.stop();
      logger.info('✅ DMX service stopped');
    } catch (err) {
      logger.error('❌ Error stopping DMX service:', { error: err });
    }

    logger.info('🎬 Stopping fade engine...');
    try {
      fadeEngine.stop();
      logger.info('✅ Fade engine stopped');
    } catch (err) {
      logger.error('❌ Error stopping fade engine:', { error: err });
    }

    // Cleanup playback service
    logger.info('🎵 Cleaning up playback service...');
    try {
      playbackService.cleanup();
      logger.info('✅ Playback service cleaned up');
    } catch (err) {
      logger.error('❌ Error cleaning up playback service:', { error: err });
    }

    // Cleanup database and PubSub connections
    logger.info('🗄️ Cleaning up database connections...');
    try {
      await cleanup();
      logger.info('✅ Database connections cleaned up');
    } catch (err) {
      logger.error('❌ Error cleaning up database connections:', { error: err });
    }

    logger.info('✅ All services stopped successfully');
  } catch (error) {
    logger.error('❌ Error during service cleanup:', { error });
  }

  // Exit process
  logger.info('👋 Server shutdown complete');
  
  // Allow process to exit naturally. As a fallback, force exit after timeout.
  setTimeout(() => {
    logger.warn('⏳ Force exiting process after graceful shutdown timeout');
    process.exit(1); // Exit with error code to indicate abnormal termination
  }, GRACEFUL_SHUTDOWN_TIMEOUT).unref();
}

// Setup signal handlers for graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n📡 Received SIGINT signal');
  gracefulShutdown();
});
process.on('SIGTERM', () => {
  logger.info('\n📡 Received SIGTERM signal');
  gracefulShutdown();
});

// Handle uncaught exceptions - exit immediately as the app is in an undefined state
// Note: While handling uncaughtException is discouraged, we use it here to ensure
// critical errors are logged before the process exits. This helps with debugging
// production issues. The immediate exit prevents the app from continuing in a corrupted state.
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught exception:', { error });
  // Don't attempt graceful shutdown on uncaught exceptions as the app state is corrupted
  process.exit(1);
});

// Handle unhandled rejections - attempt graceful shutdown
process.on('unhandledRejection', (reason, promise) => {
  // Suppress WebSocket server cleanup errors during shutdown as they're expected
  const isWebSocketShutdownError = isShuttingDown && 
    reason instanceof Error && (
      // Check for error code if available (more reliable than message)
      (reason as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING' ||
      // Fallback to message content check for common WebSocket errors
      reason.message.includes('server is not running') ||
      reason.message.includes('WebSocket server is already closed')
    );
  
  if (isWebSocketShutdownError) {
    // WebSocket cleanup errors during shutdown are expected, just log as debug
    logger.info('🔌 WebSocket cleanup completed (suppressing expected error)');
    return;
  }
  
  logger.error('💥 Unhandled rejection at:', { promise, reason });
  // Unhandled rejections are less likely to corrupt app state, so attempt graceful shutdown
  // Check if not already shutting down to prevent race conditions
  if (!isShuttingDown) {
    gracefulShutdown();
  }
});

startServer()
  .then((instances) => {
    serverInstances = instances;
  })
  .catch((error) => {
    logger.error('Failed to start server:', { error });
    process.exit(1);
  });
