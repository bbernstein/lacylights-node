module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "healthcheck\\.test\\.ts",
    "project\\.test\\.ts",
    "qlcImportExport\\.integration\\.test\\.ts",
  ],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 71,
      functions: 84,
      lines: 85,
      statements: 85,
    },
  },
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testTimeout: 30000,
  verbose: false,
  forceExit: true,
  detectOpenHandles: false,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  // Run tests in parallel - database conflicts resolved by mocking all database interactions
  maxWorkers: 16,
};
