import { LacyLightsServer } from './server';
import { logger } from './utils/logger';

async function main() {
  const server = new LacyLightsServer();

  try {
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