import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { createContext } from './context';
import { setupWebSocketServer } from './graphql/subscriptions';
import { dmxService } from './services/dmx';
import { fadeEngine } from './services/fadeEngine';
import { FixtureSetupService } from './services/fixtureSetupService';

// Graceful shutdown timeout in milliseconds
const GRACEFUL_SHUTDOWN_TIMEOUT = 10000;

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
    console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    console.log(`🔌 Subscriptions ready at ws://localhost:${PORT}/graphql`);
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
    console.log('⚠️ Shutdown already in progress...');
    return;
  }
  isShuttingDown = true;
  
  console.log('🔄 Graceful shutdown initiated...');

  try {
    // Close WebSocket server first to avoid "server is not running" errors
    if (serverInstances?.wsServer) {
      console.log('🔌 Closing WebSocket server...');
      try {
        await serverInstances.wsServer.dispose();
        console.log('✅ WebSocket server closed');
      } catch (err: any) {
        // Suppress expected WebSocket disposal errors during shutdown, log unexpected ones
        if (err && typeof err.message === 'string' && (
          err.message.includes('server is not running') ||
          err.message.includes('WebSocket server is already closed')
        )) {
          console.log('✅ WebSocket server closed (with expected cleanup warnings)');
        } else {
          console.error('❌ Unexpected error closing WebSocket server:', err);
        }
      }
    }

    // Close HTTP server after WebSocket server
    if (serverInstances?.server) {
      console.log('🌐 Closing HTTP server...');
      const httpServerInstance = serverInstances.server;
      await new Promise<void>((resolve, reject) => {
        httpServerInstance.close((err) => {
          if (err) {
            console.error('❌ Error closing HTTP server:', err);
            reject(err);
          } else {
            console.log('✅ HTTP server closed');
            resolve();
          }
        });
      });
    }

    // Stop services in reverse order of initialization
    // Note: These stop() methods are currently synchronous, but we wrap them in try-catch for safety
    console.log('🎭 Stopping DMX service...');
    try {
      dmxService.stop();
      console.log('✅ DMX service stopped');
    } catch (err) {
      console.error('❌ Error stopping DMX service:', err);
    }

    console.log('🎬 Stopping fade engine...');
    try {
      fadeEngine.stop();
      console.log('✅ Fade engine stopped');
    } catch (err) {
      console.error('❌ Error stopping fade engine:', err);
    }

    console.log('✅ All services stopped successfully');
  } catch (error) {
    console.error('❌ Error during service cleanup:', error);
  }

  // Exit process
  console.log('👋 Server shutdown complete');
  
  // Allow process to exit naturally. As a fallback, force exit after timeout.
  setTimeout(() => {
    console.warn('⏳ Force exiting process after graceful shutdown timeout');
    process.exit(1); // Exit with error code to indicate abnormal termination
  }, GRACEFUL_SHUTDOWN_TIMEOUT).unref();
}

// Setup signal handlers for graceful shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions - exit immediately as the app is in an undefined state
// Note: While handling uncaughtException is discouraged, we use it here to ensure
// critical errors are logged before the process exits. This helps with debugging
// production issues. The immediate exit prevents the app from continuing in a corrupted state.
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  // Don't attempt graceful shutdown on uncaught exceptions as the app state is corrupted
  process.exit(1);
});

// Handle unhandled rejections - attempt graceful shutdown
process.on('unhandledRejection', (reason, promise) => {
  // Suppress WebSocket server cleanup errors during shutdown as they're expected
  const isWebSocketShutdownError = isShuttingDown && 
    reason instanceof Error && (
      // Check for error code if available (more reliable than message)
      (reason as any).code === 'ERR_SERVER_NOT_RUNNING' ||
      // Fallback to message content check for common WebSocket errors
      reason.message.includes('server is not running') ||
      reason.message.includes('WebSocket server is already closed')
    );
  
  if (isWebSocketShutdownError) {
    // WebSocket cleanup errors during shutdown are expected, just log as debug
    console.log('🔌 WebSocket cleanup completed (suppressing expected error)');
    return;
  }
  
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
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
    console.error('Failed to start server:', error);
    process.exit(1);
  });
