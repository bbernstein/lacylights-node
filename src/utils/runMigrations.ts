import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

/**
 * Run pending Prisma migrations automatically on server startup.
 * This ensures the database schema is always up-to-date, especially
 * important for Raspberry Pi deployments where users click "upgrade"
 * and expect everything to work automatically.
 *
 * Can be skipped by setting SKIP_MIGRATIONS=true environment variable.
 */
export async function runMigrations(): Promise<void> {
  // Skip migrations if explicitly disabled (useful for testing)
  if (process.env.SKIP_MIGRATIONS === 'true') {
    logger.info('Skipping database migrations (SKIP_MIGRATIONS=true)');
    return;
  }

  try {
    logger.info('Checking for pending database migrations...');

    // Run migrations in deploy mode (non-interactive)
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');

    if (stdout) {
      logger.info('Migration output:', { output: stdout.trim() });
    }

    if (stderr && !stderr.includes('warnings')) {
      logger.warn('Migration warnings:', { warnings: stderr.trim() });
    }

    // Also ensure Prisma client is generated
    logger.info('Ensuring Prisma client is generated...');
    const { stdout: genStdout } = await execAsync('npx prisma generate');

    if (genStdout) {
      logger.info('Prisma client generation complete');
    }

    logger.info('Database migrations complete');
  } catch (error) {
    logger.error('Failed to run database migrations:', { error });
    throw new Error(
      `Database migration failed: ${error instanceof Error ? error.message : String(error)}\n` +
      'This may indicate a problem with the database schema or pending migrations.\n' +
      'Please check the database and migration files.'
    );
  }
}
