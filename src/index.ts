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
    // Close HTTP server first
    if (serverInstances?.server) {
      console.log('🌐 Closing HTTP server...');
      const httpServerInstance = serverInstances.server;
      await new Promise<void>((resolve) => {
        httpServerInstance.close(() => {
          console.log('✅ HTTP server closed');
          resolve();
        });
      });
    }

    // Close WebSocket server
    if (serverInstances?.wsServer) {
      console.log('🔌 Closing WebSocket server...');
      serverInstances.wsServer.dispose();
      console.log('✅ WebSocket server closed');
    }

    // Stop services in reverse order of initialization
    // Note: These stop() methods are synchronous - they just clear intervals and don't return promises
    console.log('🎭 Stopping DMX service...');
    dmxService.stop();

    console.log('🎬 Stopping fade engine...');
    fadeEngine.stop();

    console.log('✅ All services stopped successfully');
  } catch (error) {
    console.error('❌ Error during service cleanup:', error);
  }

  // Exit process
  console.log('👋 Server shutdown complete');
  process.exit(0);
}

// Setup signal handlers for graceful shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions - exit immediately as the app is in an undefined state
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  // Don't attempt graceful shutdown on uncaught exceptions as the app state is corrupted
  process.exit(1);
});

// Handle unhandled rejections - attempt graceful shutdown
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  // Unhandled rejections are less likely to corrupt app state, so attempt graceful shutdown
  gracefulShutdown();
});

startServer()
  .then((instances) => {
    serverInstances = instances;
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
