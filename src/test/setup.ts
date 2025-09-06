import { PrismaClient } from '@prisma/client';

// Global test setup
let prisma: PrismaClient | undefined;

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/lacylights_test';
  
  // Initialize Prisma client for tests
  prisma = new PrismaClient();
  
  // Connect to database
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up database connection
  if (prisma) {
    await prisma.$disconnect();
  }
});

beforeEach(async () => {
  // Clean up database before each test
  if (prisma) {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
      // TODO: Replace with proper test logging
      // eslint-disable-next-line no-console
      console.log({ error });
    }
  }
});

// Global test utilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).testPrisma = prisma;

// Increase test timeout for database operations
jest.setTimeout(30000);