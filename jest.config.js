module.exports = {
  preset: "ts-jest",
  testEnvironment: "<rootDir>/jest-environment-with-localstorage.js",
  roots: ["<rootDir>/src"],
  testMatch: [
    "**/__tests__/**/*.ts",
    "**/?(*.)+(spec|test).ts",
    "!**/*.integration.test.ts", // Exclude integration tests by default
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "healthcheck\\.test\\.ts",
    "qlcImportExport\\.integration\\.test\\.ts",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/src/test/",
    "/src/__tests__/",
  ],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/node_modules/**",
    "!src/test/*.ts", // Exclude test infrastructure helpers - specific files
    "!src/__tests__/**/*.ts", // Exclude integration tests directory
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      branches: 71,
      functions: 84, // Adjusted from 85 to account for test infrastructure exclusion
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
