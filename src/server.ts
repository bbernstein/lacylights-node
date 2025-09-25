import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express from "express";
import http from "http";
import cors from "cors";
import { typeDefs } from "./graphql/schema";
import { resolvers } from "./graphql/resolvers";
import { createContext, cleanup } from "./context";
import { setupWebSocketServer } from "./graphql/subscriptions";
import { dmxService } from "./services/dmx";
import { fadeEngine } from "./services/fadeEngine";
import { FixtureSetupService } from "./services/fixtureSetupService";
import { playbackService } from "./services/playbackService";
import { logger } from "./utils/logger";

export interface ServerConfig {
  port?: number;
  corsOrigin?: string;
  shutdownTimeout?: number;
  operationTimeout?: number;
  npmPackageVersion?: string;
}

export interface ServerDependencies {
  dmxService: typeof dmxService;
  fadeEngine: typeof fadeEngine;
  fixtureSetupService: typeof FixtureSetupService;
  playbackService: typeof playbackService;
  logger: typeof logger;
}

export interface ServerInstances {
  server: http.Server;
  wsServer: ReturnType<typeof setupWebSocketServer>;
}

export class LacyLightsServer {
  private serverInstances: ServerInstances | null = null;
  private isShuttingDown = false;
  private readonly config: Required<ServerConfig>;
  private readonly dependencies: ServerDependencies;

  constructor(
    config: ServerConfig = {},
    dependencies?: Partial<ServerDependencies>
  ) {
    this.config = {
      port: config.port || parseInt(process.env.PORT || "4000", 10),
      corsOrigin: config.corsOrigin || process.env.CORS_ORIGIN || "http://localhost:3000",
      shutdownTimeout: config.shutdownTimeout || 10000,
      operationTimeout: config.operationTimeout || 5000,
      npmPackageVersion: config.npmPackageVersion || process.env.npm_package_version || "1.0.0",
    };

    this.dependencies = {
      dmxService: dependencies?.dmxService || dmxService,
      fadeEngine: dependencies?.fadeEngine || fadeEngine,
      fixtureSetupService: dependencies?.fixtureSetupService || FixtureSetupService,
      playbackService: dependencies?.playbackService || playbackService,
      logger: dependencies?.logger || logger,
    };
  }

  createExpressApp(): express.Application {
    const app = express();
    this.setupHealthCheck(app);
    return app;
  }

  setupHealthCheck(app: express.Application): void {
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: this.config.npmPackageVersion,
      });
    });
  }

  createApolloServer(httpServer: http.Server): { apolloServer: ApolloServer<any>; wsServer: ReturnType<typeof setupWebSocketServer> } {
    const wsServer = setupWebSocketServer(httpServer);

    const apolloServer = new ApolloServer<any>({
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

    return { apolloServer, wsServer };
  }

  async initializeServices(): Promise<void> {
    await this.dependencies.fixtureSetupService.ensureFixturesPopulated();
    await this.dependencies.dmxService.initialize();
  }

  async start(): Promise<ServerInstances> {
    const app = this.createExpressApp();
    const httpServer = http.createServer(app);

    const { apolloServer, wsServer } = this.createApolloServer(httpServer);
    await apolloServer.start();

    app.use(
      "/graphql",
      cors<cors.CorsRequest>({
        origin: this.config.corsOrigin,
        credentials: true,
      }),
      express.json({ limit: "50mb" }),
      expressMiddleware(apolloServer, {
        context: createContext,
      }),
    );

    await this.initializeServices();

    const httpListener = httpServer.listen(this.config.port, () => {
      this.dependencies.logger.info(`🚀 Server ready at http://localhost:${this.config.port}/graphql`);
      this.dependencies.logger.info(`🔌 Subscriptions ready at ws://localhost:${this.config.port}/graphql`);
    });

    this.serverInstances = { server: httpListener, wsServer };
    return this.serverInstances;
  }

  async shutdownWebSocket(): Promise<void> {
    if (!this.serverInstances?.wsServer) {return;}

    this.dependencies.logger.info("🔌 Closing WebSocket server...");
    try {
      const webSocketTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("WebSocket disposal timeout")),
          this.config.operationTimeout,
        ),
      );

      await Promise.race([
        this.serverInstances.wsServer.dispose(),
        webSocketTimeout,
      ]);
      this.dependencies.logger.info("✅ WebSocket server closed");
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof err.message === "string" &&
        (err.message.includes("server is not running") ||
          err.message.includes("WebSocket server is already closed") ||
          err.message.includes("WebSocket disposal timeout"))
      ) {
        this.dependencies.logger.info(
          "✅ WebSocket server closed (with expected cleanup warnings)",
        );
      } else {
        this.dependencies.logger.error("❌ Unexpected error closing WebSocket server:", {
          error: err,
        });
      }
    }
  }

  async shutdownHttpServer(): Promise<void> {
    if (!this.serverInstances?.server) {return;}

    this.dependencies.logger.info("🌐 Closing HTTP server...");
    const httpServerInstance = this.serverInstances.server;
    try {
      const httpTimeout = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("HTTP server close timeout")),
          this.config.operationTimeout,
        ),
      );

      const httpClose = new Promise<void>((resolve, reject) => {
        httpServerInstance.close((err) => {
          if (err) {
            this.dependencies.logger.error("❌ Error closing HTTP server:", { error: err });
            reject(err);
          } else {
            this.dependencies.logger.info("✅ HTTP server closed");
            resolve();
          }
        });
      });

      await Promise.race([httpClose, httpTimeout]);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "message" in err &&
        err.message === "HTTP server close timeout"
      ) {
        this.dependencies.logger.info("✅ HTTP server closed (timeout - likely closed)");
      } else {
        this.dependencies.logger.error("❌ Error closing HTTP server:", { error: err });
      }
    }
  }

  async cleanupServices(): Promise<void> {
    this.dependencies.logger.info("🎭 Stopping DMX service...");
    try {
      this.dependencies.dmxService.stop();
      this.dependencies.logger.info("✅ DMX service stopped");
    } catch (err) {
      this.dependencies.logger.error("❌ Error stopping DMX service:", { error: err });
    }

    this.dependencies.logger.info("🎬 Stopping fade engine...");
    try {
      this.dependencies.fadeEngine.stop();
      this.dependencies.logger.info("✅ Fade engine stopped");
    } catch (err) {
      this.dependencies.logger.error("❌ Error stopping fade engine:", { error: err });
    }

    this.dependencies.logger.info("🎵 Cleaning up playback service...");
    try {
      this.dependencies.playbackService.cleanup();
      this.dependencies.logger.info("✅ Playback service cleaned up");
    } catch (err) {
      this.dependencies.logger.error("❌ Error cleaning up playback service:", { error: err });
    }

    this.dependencies.logger.info("🗄️ Cleaning up database connections...");
    try {
      await cleanup();
      this.dependencies.logger.info("✅ Database connections cleaned up");
    } catch (err) {
      this.dependencies.logger.error("❌ Error cleaning up database connections:", {
        error: err,
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      this.dependencies.logger.warn("⚠️ Shutdown already in progress...");
      return;
    }
    this.isShuttingDown = true;

    this.dependencies.logger.info("🔄 Graceful shutdown initiated...");

    try {
      await this.shutdownWebSocket();
      await this.shutdownHttpServer();
      await this.cleanupServices();

      this.dependencies.logger.info("✅ All services stopped successfully");
    } catch (error) {
      this.dependencies.logger.error("❌ Error during service cleanup:", { error });
    }

    this.dependencies.logger.info("👋 Server shutdown complete");

    // Only set force exit timeout if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        this.dependencies.logger.warn("⏳ Force exiting process after graceful shutdown timeout");
        process.exit(1);
      }, this.config.shutdownTimeout).unref();
    }
  }

  setupSignalHandlers(): void {
    process.on("SIGINT", () => {
      this.dependencies.logger.info("\n📡 Received SIGINT signal");
      this.shutdown();
    });

    process.on("SIGTERM", () => {
      this.dependencies.logger.info("\n📡 Received SIGTERM signal");
      this.shutdown();
    });

    process.on("uncaughtException", (error) => {
      this.dependencies.logger.error("💥 Uncaught exception:", { error });
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      const isWebSocketShutdownError =
        this.isShuttingDown &&
        reason instanceof Error &&
        ((reason as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING" ||
          reason.message.includes("server is not running") ||
          reason.message.includes("WebSocket server is already closed"));

      if (isWebSocketShutdownError) {
        this.dependencies.logger.info("🔌 WebSocket cleanup completed (suppressing expected error)");
        return;
      }

      this.dependencies.logger.error("💥 Unhandled rejection at:", { promise, reason });
      if (!this.isShuttingDown) {
        this.shutdown();
      }
    });
  }

  getConfig(): Required<ServerConfig> {
    return { ...this.config };
  }

  getDependencies(): ServerDependencies {
    return { ...this.dependencies };
  }

  getServerInstances(): ServerInstances | null {
    return this.serverInstances;
  }

  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}