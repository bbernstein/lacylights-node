import 'dotenv/config';
import { LacyLightsServer } from './server';
import { logger } from './utils/logger';
import { runMigrations } from './utils/runMigrations';

async function main() {
  try {
    // Run database migrations before starting the server
    // This ensures automatic schema updates for Raspberry Pi deployments
    await runMigrations();

    const server = new LacyLightsServer();
    server.setupSignalHandlers();
    await server.start();
  } catch (error) {
    logger.error("Failed to start server:", { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main };