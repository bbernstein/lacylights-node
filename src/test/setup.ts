// Set environment variables FIRST, before any imports that might use them
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "ERROR"; // Only show errors during tests
// Set a mock database URL - tests should not require real database
process.env.DATABASE_URL = "file:./prisma/test.db";

// Mock localStorage for tests that might need it
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).localStorage = localStorageMock;

// Mock PrismaClient globally for all tests
const mockPrismaClient = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRaw: jest.fn().mockResolvedValue([]),
  $executeRaw: jest.fn().mockResolvedValue({ count: 0 }),
  $executeRawUnsafe: jest.fn().mockResolvedValue({ count: 0 }),
  $transaction: jest.fn(),
  $use: jest.fn().mockReturnValue(undefined), // Mock middleware registration
  project: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  fixture: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  scene: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  cueList: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  cue: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  fixtureDefinition: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
};

// Note: We don't mock fadeEngine or dmxService globally as their tests need the real implementations
// Individual test files will mock these as needed

// Global test setup - no database connections required
beforeAll(async () => {
  // No real database setup needed - all mocked
  jest.clearAllMocks();
});

afterAll(async () => {
  // Clear all timers and intervals to ensure clean exit
  jest.clearAllTimers();
  jest.clearAllMocks();
});

beforeEach(async () => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

// Global test utilities - provide mock prisma instead of real one
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).testPrisma = mockPrismaClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).mockPrisma = mockPrismaClient;

// Increase test timeout for database operations
jest.setTimeout(30000);
