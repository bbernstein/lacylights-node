// Set environment variables FIRST, before any imports that might use them
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "ERROR"; // Only show errors during tests
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://lacylights:lacylights_dev_password@localhost:5432/lacylights_test";

import { PrismaClient } from "@prisma/client";

// Global test setup
let prisma: PrismaClient | undefined;

beforeAll(async () => {
  // Try to connect to database, but don't fail if it's not available
  try {
    // Initialize Prisma client for tests with explicit DATABASE_URL
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Connect to database with a short timeout
    await prisma.$connect();
  } catch {
    // If database connection fails, set prisma to undefined so tests can skip database operations
    prisma = undefined;
    // eslint-disable-next-line no-console
    console.warn('⚠️  Database not available - some tests may be skipped');
  }
});

afterAll(async () => {
  // Clean up database connection
  if (prisma) {
    await prisma.$disconnect();
  }
});

beforeEach(async () => {
  // Clean up database before each test (only if database is available)
  if (prisma) {
    try {
      const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='public'
      `;

      const tables = tablenames
        .map(({ tablename }) => tablename)
        .filter((name) => name !== "_prisma_migrations")
        .map((name) => `"public"."${name}"`)
        .join(", ");

      if (tables) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      }
    } catch (error) {
      // If database cleanup fails, just warn - don't fail the test
      // eslint-disable-next-line no-console
      console.warn('Database cleanup failed:', error);
    }
  }
});

// Global test utilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).testPrisma = prisma;

// Increase test timeout for database operations
jest.setTimeout(30000);
